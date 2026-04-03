import oracledb from 'oracledb';
import * as dotenv from 'dotenv';

dotenv.config();

// Set TNS_ADMIN BEFORE initializing Oracle Client
process.env.TNS_ADMIN = '/home/ubuntu/cto-aipa/wallet';

// Use thick mode with Oracle Instant Client for better wallet support
try {
  oracledb.initOracleClient({ 
    libDir: '/opt/instantclient_23_4'
  });
  console.log('✅ Oracle Thick Mode initialized');
  console.log(`📁 TNS_ADMIN: ${process.env.TNS_ADMIN}`);
} catch (err: any) {
  if (err.message.includes('already been initialized')) {
    console.log('✅ Oracle Thick Mode already initialized');
  } else {
    console.error('❌ Oracle Thick Mode error:', err);
  }
}

interface DBConfig {
  user: string;
  password: string;
  connectionString: string;
}

const dbConfig: DBConfig = {
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  connectionString: process.env.DB_SERVICE_NAME!
};

async function initializeDatabase() {
  let connection;
  try {
    console.log(`🔌 Connecting to ${dbConfig.connectionString}...`);
    connection = await oracledb.getConnection(dbConfig);
    console.log('🔗 Connected to Oracle Autonomous Database (mTLS)');

    // Original memory table
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE aipa_memory (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          aipa_type VARCHAR2(50) NOT NULL,
          action VARCHAR2(100) NOT NULL,
          context CLOB,
          result CLOB,
          metadata CLOB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN
            RAISE;
          END IF;
      END;
    `);

    // Technical debt tracking table
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE tech_debt (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          repo VARCHAR2(100) NOT NULL,
          description CLOB NOT NULL,
          severity VARCHAR2(20) DEFAULT ''medium'',
          status VARCHAR2(20) DEFAULT ''open'',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          resolved_at TIMESTAMP
        )';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN
            RAISE;
          END IF;
      END;
    `);

    // Architectural decisions table
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE arch_decisions (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          repo VARCHAR2(100),
          title VARCHAR2(500) NOT NULL,
          description CLOB NOT NULL,
          rationale CLOB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN
            RAISE;
          END IF;
      END;
    `);

    // Pending code for approval workflow
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE pending_code (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          chat_id NUMBER NOT NULL,
          repo VARCHAR2(100) NOT NULL,
          task CLOB NOT NULL,
          filename VARCHAR2(500) NOT NULL,
          code CLOB NOT NULL,
          commit_message VARCHAR2(500),
          pr_title VARCHAR2(500),
          pr_body CLOB,
          status VARCHAR2(20) DEFAULT ''pending'',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN
            RAISE;
          END IF;
      END;
    `);

    // Alert preferences (persistent)
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE alert_preferences (
          chat_id NUMBER PRIMARY KEY,
          alerts_enabled NUMBER(1) DEFAULT 1,
          daily_briefing NUMBER(1) DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN
            RAISE;
          END IF;
      END;
    `);

    console.log('✅ Database schema initialized (5 tables)');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    throw err;
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

async function saveMemory(aipaType: string, action: string, context: any, result: any, metadata: any) {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `INSERT INTO aipa_memory (aipa_type, action, context, result, metadata)
       VALUES (:aipaType, :action, :context, :result, :metadata)`,
      {
        aipaType,
        action,
        context: JSON.stringify(context),
        result: JSON.stringify(result),
        metadata: JSON.stringify(metadata)
      },
      { autoCommit: true }
    );
    console.log('💾 Memory saved');
  } catch (err) {
    console.error('❌ Save memory error:', err);
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

async function getRelevantMemory(aipaType: string, action: string, limit: number = 5) {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT context, result, metadata, created_at
       FROM aipa_memory
       WHERE aipa_type = :aipaType AND action = :action
       ORDER BY created_at DESC
       FETCH FIRST :limit ROWS ONLY`,
      { aipaType, action, limit }
    );
    return result.rows;
  } catch (err) {
    console.error('❌ Get memory error:', err);
    return [];
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

// =============================================================================
// TECHNICAL DEBT FUNCTIONS
// =============================================================================

async function addTechDebt(repo: string, description: string, severity: string = 'medium'): Promise<string | null> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `INSERT INTO tech_debt (repo, description, severity) 
       VALUES (:repo, :description, :severity)
       RETURNING RAWTOHEX(id) INTO :id`,
      {
        repo,
        description,
        severity,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
      },
      { autoCommit: true }
    );
    const outBinds = result.outBinds as { id: string[] };
    console.log('📋 Tech debt added');
    return outBinds.id[0] || null;
  } catch (err) {
    console.error('❌ Add tech debt error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function getTechDebt(repo?: string, status: string = 'open'): Promise<any[]> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    let query = `SELECT RAWTOHEX(id) as id, repo, description, severity, status, created_at 
                 FROM tech_debt WHERE status = :status`;
    const params: any = { status };
    
    if (repo) {
      query += ` AND repo = :repo`;
      params.repo = repo;
    }
    query += ` ORDER BY created_at DESC FETCH FIRST 20 ROWS ONLY`;
    
    const result = await connection.execute(query, params);
    return result.rows || [];
  } catch (err) {
    console.error('❌ Get tech debt error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

async function resolveTechDebt(debtId: string): Promise<boolean> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `UPDATE tech_debt SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP 
       WHERE id = HEXTORAW(:debtId)`,
      { debtId },
      { autoCommit: true }
    );
    console.log('✅ Tech debt resolved');
    return true;
  } catch (err) {
    console.error('❌ Resolve tech debt error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

// =============================================================================
// ARCHITECTURAL DECISIONS FUNCTIONS
// =============================================================================

async function addDecision(title: string, description: string, rationale: string, repo?: string): Promise<string | null> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `INSERT INTO arch_decisions (repo, title, description, rationale) 
       VALUES (:repo, :title, :description, :rationale)
       RETURNING RAWTOHEX(id) INTO :id`,
      {
        repo: repo || null,
        title,
        description,
        rationale,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
      },
      { autoCommit: true }
    );
    const outBinds = result.outBinds as { id: string[] };
    console.log('🏛️ Decision recorded');
    return outBinds.id[0] || null;
  } catch (err) {
    console.error('❌ Add decision error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function getDecisions(repo?: string, limit: number = 10): Promise<any[]> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    let query = `SELECT RAWTOHEX(id) as id, repo, title, description, rationale, created_at 
                 FROM arch_decisions`;
    const params: any = { limit };
    
    if (repo) {
      query += ` WHERE repo = :repo`;
      params.repo = repo;
    }
    query += ` ORDER BY created_at DESC FETCH FIRST :limit ROWS ONLY`;
    
    const result = await connection.execute(query, params);
    return result.rows || [];
  } catch (err) {
    console.error('❌ Get decisions error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

// =============================================================================
// PENDING CODE FUNCTIONS (for approval workflow)
// =============================================================================

async function savePendingCode(
  chatId: number, 
  repo: string, 
  task: string, 
  filename: string, 
  code: string,
  commitMessage: string,
  prTitle: string,
  prBody: string
): Promise<string | null> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    // Clear any existing pending code for this chat
    await connection.execute(
      `DELETE FROM pending_code WHERE chat_id = :chatId AND status = 'pending'`,
      { chatId },
      { autoCommit: false }
    );
    
    const result = await connection.execute(
      `INSERT INTO pending_code (chat_id, repo, task, filename, code, commit_message, pr_title, pr_body) 
       VALUES (:chatId, :repo, :task, :filename, :code, :commitMessage, :prTitle, :prBody)
       RETURNING RAWTOHEX(id) INTO :id`,
      {
        chatId,
        repo,
        task,
        filename,
        code,
        commitMessage,
        prTitle,
        prBody,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
      },
      { autoCommit: true }
    );
    const outBinds = result.outBinds as { id: string[] };
    console.log('💾 Pending code saved');
    return outBinds.id[0] || null;
  } catch (err) {
    console.error('❌ Save pending code error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function getPendingCode(chatId: number): Promise<any | null> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT RAWTOHEX(id) as id, repo, task, filename, code, commit_message, pr_title, pr_body, created_at
       FROM pending_code 
       WHERE chat_id = :chatId AND status = 'pending'
       ORDER BY created_at DESC FETCH FIRST 1 ROW ONLY`,
      { chatId }
    );
    if (result.rows && result.rows.length > 0) {
      return result.rows[0];
    }
    return null;
  } catch (err) {
    console.error('❌ Get pending code error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function clearPendingCode(chatId: number, status: string = 'approved'): Promise<boolean> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `UPDATE pending_code SET status = :status WHERE chat_id = :chatId AND status = 'pending'`,
      { chatId, status },
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error('❌ Clear pending code error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

// =============================================================================
// ALERT PREFERENCES FUNCTIONS (persistent)
// =============================================================================

async function getAlertPreferences(chatId: number): Promise<{ alertsEnabled: boolean; dailyBriefing: boolean } | null> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT alerts_enabled, daily_briefing FROM alert_preferences WHERE chat_id = :chatId`,
      { chatId }
    );
    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0] as [number, number];
      return {
        alertsEnabled: row[0] === 1,
        dailyBriefing: row[1] === 1
      };
    }
    return null;
  } catch (err) {
    console.error('❌ Get alert preferences error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function setAlertPreferences(chatId: number, alertsEnabled: boolean, dailyBriefing: boolean = true): Promise<boolean> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `MERGE INTO alert_preferences ap
       USING (SELECT :chatId as chat_id FROM dual) src
       ON (ap.chat_id = src.chat_id)
       WHEN MATCHED THEN UPDATE SET alerts_enabled = :alertsEnabled, daily_briefing = :dailyBriefing
       WHEN NOT MATCHED THEN INSERT (chat_id, alerts_enabled, daily_briefing) VALUES (:chatId, :alertsEnabled, :dailyBriefing)`,
      { 
        chatId, 
        alertsEnabled: alertsEnabled ? 1 : 0, 
        dailyBriefing: dailyBriefing ? 1 : 0 
      },
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error('❌ Set alert preferences error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

async function getAllAlertChatIds(): Promise<number[]> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT chat_id FROM alert_preferences WHERE alerts_enabled = 1`
    );
    if (result.rows) {
      return result.rows.map((row: any) => row[0] as number);
    }
    return [];
  } catch (err) {
    console.error('❌ Get all alert chat IDs error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

// =============================================================================
// LESSONS LEARNED - CTO learns from experience!
// =============================================================================

async function initLessonsTable(): Promise<void> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(`
      CREATE TABLE lessons (
        id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
        category VARCHAR2(50),
        context VARCHAR2(500),
        action_taken VARCHAR2(1000),
        outcome VARCHAR2(50),
        lesson_learned VARCHAR2(1000),
        repo VARCHAR2(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await connection.commit();
    console.log('✅ Lessons table created');
  } catch (err: any) {
    if (err.errorNum === 955) {
      // Table already exists
    } else {
      console.error('Lessons table error:', err);
    }
  } finally {
    if (connection) await connection.close();
  }
}

async function saveLesson(
  category: string,
  context: string,
  actionTaken: string,
  outcome: 'success' | 'failure' | 'partial',
  lessonLearned: string,
  repo?: string
): Promise<string | null> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `INSERT INTO lessons (category, context, action_taken, outcome, lesson_learned, repo)
       VALUES (:category, :context, :action, :outcome, :lesson, :repo)
       RETURNING RAWTOHEX(id) INTO :id`,
      {
        category,
        context: context.substring(0, 500),
        action: actionTaken.substring(0, 1000),
        outcome,
        lesson: lessonLearned.substring(0, 1000),
        repo: repo || null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING }
      }
    );
    await connection.commit();
    return (result.outBinds as any).id[0];
  } catch (err) {
    console.error('❌ Save lesson error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function getLessons(category?: string, limit: number = 10): Promise<any[]> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    let query = `SELECT RAWTOHEX(id) as id, category, context, action_taken, outcome, lesson_learned, repo, created_at
                 FROM lessons`;
    const params: any = { limit };
    
    if (category) {
      query += ` WHERE category = :category`;
      params.category = category;
    }
    query += ` ORDER BY created_at DESC FETCH FIRST :limit ROWS ONLY`;
    
    const result = await connection.execute(query, params);
    return result.rows || [];
  } catch (err) {
    console.error('❌ Get lessons error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

async function getSuccessPatterns(repo?: string): Promise<any[]> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    let query = `SELECT category, action_taken, lesson_learned, repo
                 FROM lessons WHERE outcome = 'success'`;
    const params: any = {};
    
    if (repo) {
      query += ` AND repo = :repo`;
      params.repo = repo;
    }
    query += ` ORDER BY created_at DESC FETCH FIRST 20 ROWS ONLY`;
    
    const result = await connection.execute(query, params);
    return result.rows || [];
  } catch (err) {
    console.error('❌ Get success patterns error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

// =============================================================================
// STRATEGIC DATA - Track ecosystem health and priorities
// =============================================================================

async function initStrategicTable(): Promise<void> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(`
      CREATE TABLE strategic_insights (
        id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
        insight_type VARCHAR2(50),
        repo VARCHAR2(100),
        insight_text VARCHAR2(2000),
        priority NUMBER(1),
        status VARCHAR2(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);
    await connection.commit();
    console.log('✅ Strategic insights table created');
  } catch (err: any) {
    if (err.errorNum === 955) {
      // Table already exists
    } else {
      console.error('Strategic table error:', err);
    }
  } finally {
    if (connection) await connection.close();
  }
}

async function saveInsight(
  insightType: string,
  insightText: string,
  priority: number,
  repo?: string
): Promise<string | null> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `INSERT INTO strategic_insights (insight_type, repo, insight_text, priority)
       VALUES (:type, :repo, :text, :priority)
       RETURNING RAWTOHEX(id) INTO :id`,
      {
        type: insightType,
        repo: repo || null,
        text: insightText.substring(0, 2000),
        priority,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING }
      }
    );
    await connection.commit();
    return (result.outBinds as any).id[0];
  } catch (err) {
    console.error('❌ Save insight error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function getActiveInsights(): Promise<any[]> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT RAWTOHEX(id) as id, insight_type, repo, insight_text, priority, created_at
       FROM strategic_insights 
       WHERE status = 'active'
       ORDER BY priority DESC, created_at DESC
       FETCH FIRST 20 ROWS ONLY`
    );
    return result.rows || [];
  } catch (err) {
    console.error('❌ Get insights error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

async function resolveInsight(insightId: string): Promise<boolean> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `UPDATE strategic_insights 
       SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP
       WHERE id = HEXTORAW(:id)`,
      { id: insightId }
    );
    await connection.commit();
    return true;
  } catch (err) {
    console.error('❌ Resolve insight error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

// =============================================================================
// SERVICE HEALTH TRACKING
// =============================================================================

async function initHealthTable(): Promise<void> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(`
      CREATE TABLE service_health (
        id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
        service_name VARCHAR2(100),
        status VARCHAR2(20),
        response_time NUMBER,
        error_message VARCHAR2(500),
        checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await connection.commit();
    console.log('✅ Service health table created');
  } catch (err: any) {
    if (err.errorNum === 955) {
      // Table already exists
    } else {
      console.error('Health table error:', err);
    }
  } finally {
    if (connection) await connection.close();
  }
}

async function saveHealthCheck(
  serviceName: string,
  status: 'healthy' | 'degraded' | 'down',
  responseTime?: number,
  errorMessage?: string
): Promise<void> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `INSERT INTO service_health (service_name, status, response_time, error_message)
       VALUES (:name, :status, :time, :error)`,
      {
        name: serviceName,
        status,
        time: responseTime || null,
        error: errorMessage?.substring(0, 500) || null
      }
    );
    await connection.commit();
  } catch (err) {
    console.error('❌ Save health check error:', err);
  } finally {
    if (connection) await connection.close();
  }
}

async function getHealthHistory(serviceName?: string, hours: number = 24): Promise<any[]> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    let query = `SELECT service_name, status, response_time, error_message, checked_at
                 FROM service_health
                 WHERE checked_at > CURRENT_TIMESTAMP - INTERVAL '${hours}' HOUR`;
    const params: any = {};
    
    if (serviceName) {
      query += ` AND service_name = :name`;
      params.name = serviceName;
    }
    query += ` ORDER BY checked_at DESC FETCH FIRST 100 ROWS ONLY`;
    
    const result = await connection.execute(query, params);
    return result.rows || [];
  } catch (err) {
    console.error('❌ Get health history error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

// =============================================================================
// CONVERSATION CONTEXT - Persistent session memory (NEW - Personal AI Upgrade)
// =============================================================================

async function initConversationContextTable(): Promise<void> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(`
      CREATE TABLE conversation_context (
        user_id NUMBER PRIMARY KEY,
        active_project VARCHAR2(100),
        active_file VARCHAR2(500),
        recent_files CLOB,
        recent_questions CLOB,
        pending_fixes CLOB,
        batch_edits CLOB,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await connection.commit();
    console.log('✅ Conversation context table created');
  } catch (err: any) {
    if (err.errorNum === 955) {
      // Table already exists - this is fine
    } else {
      console.error('Conversation context table error:', err);
    }
  } finally {
    if (connection) await connection.close();
  }
}

interface ConversationContextData {
  activeProject: string | null;
  activeFile: string | null;
  recentFiles: { repo: string; path: string; content: string; timestamp: number }[];
  recentQuestions: { question: string; answer: string; timestamp: number }[];
  pendingFixes: { description: string; code: string; file?: string }[];
  batchEdits: { repo: string; path: string; content: string; sha: string }[];
  lastUpdated: number;
}

async function saveConversationContext(userId: number, context: ConversationContextData): Promise<boolean> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `MERGE INTO conversation_context cc
       USING (SELECT :userId as user_id FROM dual) src
       ON (cc.user_id = src.user_id)
       WHEN MATCHED THEN UPDATE SET 
         active_project = :activeProject,
         active_file = :activeFile,
         recent_files = :recentFiles,
         recent_questions = :recentQuestions,
         pending_fixes = :pendingFixes,
         batch_edits = :batchEdits,
         last_updated = CURRENT_TIMESTAMP
       WHEN NOT MATCHED THEN INSERT (user_id, active_project, active_file, recent_files, recent_questions, pending_fixes, batch_edits)
       VALUES (:userId, :activeProject, :activeFile, :recentFiles, :recentQuestions, :pendingFixes, :batchEdits)`,
      {
        userId,
        activeProject: context.activeProject || null,
        activeFile: context.activeFile || null,
        recentFiles: JSON.stringify(context.recentFiles || []),
        recentQuestions: JSON.stringify(context.recentQuestions || []),
        pendingFixes: JSON.stringify(context.pendingFixes || []),
        batchEdits: JSON.stringify(context.batchEdits || [])
      },
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error('❌ Save conversation context error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

async function loadConversationContext(userId: number): Promise<ConversationContextData | null> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT active_project, active_file, recent_files, recent_questions, pending_fixes, batch_edits, last_updated
       FROM conversation_context WHERE user_id = :userId`,
      { userId },
      {
        fetchInfo: {
          RECENT_FILES:     { type: oracledb.STRING },
          RECENT_QUESTIONS: { type: oracledb.STRING },
          PENDING_FIXES:    { type: oracledb.STRING },
          BATCH_EDITS:      { type: oracledb.STRING }
        }
      }
    );
    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0] as any[];
      const safeJson = (val: any, fallback: string): any => {
        try {
          const str = typeof val === 'string' ? val : String(val ?? fallback);
          return JSON.parse(str || fallback);
        } catch {
          return JSON.parse(fallback);
        }
      };
      return {
        activeProject: row[0],
        activeFile: row[1],
        recentFiles:      safeJson(row[2], '[]'),
        recentQuestions:  safeJson(row[3], '[]'),
        pendingFixes:     safeJson(row[4], '[]'),
        batchEdits:       safeJson(row[5], '[]'),
        lastUpdated: row[6] ? new Date(row[6]).getTime() : Date.now()
      };
    }
    return null;
  } catch (err) {
    console.error('❌ Load conversation context error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function clearConversationContext(userId: number): Promise<boolean> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `DELETE FROM conversation_context WHERE user_id = :userId`,
      { userId },
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error('❌ Clear conversation context error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

// =============================================================================
// KNOWLEDGE BASE - Personal ideas, diary, notes, tasks (NEW - Personal AI Upgrade)
// =============================================================================

async function initKnowledgeBaseTable(): Promise<void> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(`
      CREATE TABLE knowledge_base (
        id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
        user_id NUMBER NOT NULL,
        category VARCHAR2(50),
        title VARCHAR2(500),
        content CLOB,
        tags VARCHAR2(500),
        project VARCHAR2(100),
        source VARCHAR2(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP
      )
    `);
    await connection.commit();
    console.log('✅ Knowledge base table created');
  } catch (err: any) {
    if (err.errorNum === 955) {
      // Table already exists - this is fine
    } else {
      console.error('Knowledge base table error:', err);
    }
  } finally {
    if (connection) await connection.close();
  }
}

async function saveKnowledge(
  userId: number,
  category: string,
  title: string,
  content: string,
  tags?: string,
  project?: string,
  source: string = 'text'
): Promise<string | null> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `INSERT INTO knowledge_base (user_id, category, title, content, tags, project, source)
       VALUES (:userId, :category, :title, :content, :tags, :project, :source)
       RETURNING RAWTOHEX(id) INTO :id`,
      {
        userId,
        category,
        title: title.substring(0, 500),
        content,
        tags: tags?.substring(0, 500) || null,
        project: project || null,
        source,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
      },
      { autoCommit: true }
    );
    const outBinds = result.outBinds as { id: string[] };
    console.log(`💡 Knowledge saved: ${category} - ${title.substring(0, 30)}...`);
    return outBinds.id[0] || null;
  } catch (err) {
    console.error('❌ Save knowledge error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function searchKnowledge(
  userId: number,
  query: string,
  category?: string,
  limit: number = 10
): Promise<any[]> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    let sql = `SELECT RAWTOHEX(id) as id, category, title, content, tags, project, source, created_at
               FROM knowledge_base 
               WHERE user_id = :userId 
               AND (UPPER(title) LIKE UPPER(:query) OR UPPER(content) LIKE UPPER(:query) OR UPPER(tags) LIKE UPPER(:query))`;
    const params: any = { userId, query: `%${query}%`, limit };
    
    if (category) {
      sql += ` AND category = :category`;
      params.category = category;
    }
    sql += ` ORDER BY created_at DESC FETCH FIRST :limit ROWS ONLY`;
    
    const result = await connection.execute(sql, params);
    return result.rows || [];
  } catch (err) {
    console.error('❌ Search knowledge error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

async function getKnowledgeByCategory(
  userId: number,
  category: string,
  limit: number = 20
): Promise<any[]> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT RAWTOHEX(id) as id, category, title, content, tags, project, source, created_at
       FROM knowledge_base 
       WHERE user_id = :userId AND category = :category
       ORDER BY created_at DESC FETCH FIRST :limit ROWS ONLY`,
      { userId, category, limit }
    );
    return result.rows || [];
  } catch (err) {
    console.error('❌ Get knowledge by category error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

async function getRecentKnowledge(
  userId: number,
  days: number = 7,
  limit: number = 20
): Promise<any[]> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT RAWTOHEX(id) as id, category, title, content, tags, project, source, created_at
       FROM knowledge_base 
       WHERE user_id = :userId 
       AND created_at > CURRENT_TIMESTAMP - INTERVAL '${days}' DAY
       ORDER BY created_at DESC FETCH FIRST :limit ROWS ONLY`,
      { userId, limit }
    );
    return result.rows || [];
  } catch (err) {
    console.error('❌ Get recent knowledge error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

async function getKnowledgeByProject(
  userId: number,
  project: string,
  limit: number = 20
): Promise<any[]> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT RAWTOHEX(id) as id, category, title, content, tags, project, source, created_at
       FROM knowledge_base 
       WHERE user_id = :userId AND project = :project
       ORDER BY created_at DESC FETCH FIRST :limit ROWS ONLY`,
      { userId, project, limit }
    );
    return result.rows || [];
  } catch (err) {
    console.error('❌ Get knowledge by project error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

// =============================================================================
// AGENT OUTCOMES — Cross-agent outcome tracking (Week 1 Wiring Build)
// Every agent writes what it did + whether it worked.
// CTO AIPA briefing reads from here. AILA inherits this table.
// =============================================================================

async function initAgentOutcomesTable(): Promise<void> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE agent_outcomes (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          agent_name VARCHAR2(50) NOT NULL,
          action_type VARCHAR2(100) NOT NULL,
          action_detail CLOB,
          outcome_status VARCHAR2(50) DEFAULT ''pending_verification'',
          outcome_detail CLOB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          verified_at TIMESTAMP
        )';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    console.log('✅ agent_outcomes table ready');
  } catch (err) {
    console.error('agent_outcomes table error:', err);
  } finally {
    if (connection) await connection.close();
  }
}

async function saveAgentOutcome(
  agentName: string,
  actionType: string,
  actionDetail: any,
  outcomeStatus: string = 'pending_verification',
  outcomeDetail?: any
): Promise<string | null> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `INSERT INTO agent_outcomes (agent_name, action_type, action_detail, outcome_status, outcome_detail)
       VALUES (:agentName, :actionType, :actionDetail, :outcomeStatus, :outcomeDetail)
       RETURNING RAWTOHEX(id) INTO :id`,
      {
        agentName,
        actionType,
        actionDetail: JSON.stringify(actionDetail),
        outcomeStatus,
        outcomeDetail: outcomeDetail ? JSON.stringify(outcomeDetail) : null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
      },
      { autoCommit: true }
    );
    const outBinds = result.outBinds as { id: string[] };
    return outBinds.id[0] || null;
  } catch (err) {
    console.error('❌ Save agent outcome error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function verifyAgentOutcome(
  outcomeId: string,
  outcomeStatus: string,
  outcomeDetail?: any
): Promise<boolean> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `UPDATE agent_outcomes
       SET outcome_status = :outcomeStatus,
           outcome_detail = :outcomeDetail,
           verified_at = CURRENT_TIMESTAMP
       WHERE id = HEXTORAW(:outcomeId)`,
      {
        outcomeStatus,
        outcomeDetail: outcomeDetail ? JSON.stringify(outcomeDetail) : null,
        outcomeId
      },
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error('❌ Verify agent outcome error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

async function getAgentOutcomes(
  agentName?: string,
  hoursBack: number = 24,
  limit: number = 50
): Promise<any[]> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    let query = `SELECT RAWTOHEX(id) as id, agent_name, action_type, action_detail,
                        outcome_status, outcome_detail, created_at, verified_at
                 FROM agent_outcomes
                 WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1' HOUR * :hoursBack`;
    const params: any = { hoursBack, limit };

    if (agentName) {
      query += ` AND agent_name = :agentName`;
      params.agentName = agentName;
    }
    query += ` ORDER BY created_at DESC FETCH FIRST :limit ROWS ONLY`;

    const result = await connection.execute(query, params);
    return result.rows || [];
  } catch (err) {
    console.error('❌ Get agent outcomes error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

async function getOutcomeSummary(hoursBack: number = 24): Promise<{
  total: number;
  verified_delivered: number;
  verified_failed: number;
  pending: number;
  positive: number;
  negative: number;
  by_agent: Record<string, number>;
}> {
  let connection;
  const summary = {
    total: 0, verified_delivered: 0, verified_failed: 0,
    pending: 0, positive: 0, negative: 0, by_agent: {} as Record<string, number>
  };
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT agent_name, outcome_status, COUNT(*) as cnt
       FROM agent_outcomes
       WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1' HOUR * :hoursBack
       GROUP BY agent_name, outcome_status`,
      { hoursBack }
    );
    if (result.rows) {
      for (const row of result.rows as any[]) {
        const [agent, status, count] = row;
        const cnt = Number(count);
        summary.total += cnt;
        if (status === 'verified_delivered') summary.verified_delivered += cnt;
        else if (status === 'verified_failed') summary.verified_failed += cnt;
        else if (status === 'pending_verification') summary.pending += cnt;
        else if (status === 'outcome_positive') summary.positive += cnt;
        else if (status === 'outcome_negative') summary.negative += cnt;
        summary.by_agent[agent] = (summary.by_agent[agent] || 0) + cnt;
      }
    }
    return summary;
  } catch (err) {
    console.error('❌ Get outcome summary error:', err);
    return summary;
  } finally {
    if (connection) await connection.close();
  }
}

// =============================================================================
// BUSINESS LEADS — Track engagement signals from LinkedIn/social/inbound
// =============================================================================

async function initBusinessLeadsTable(): Promise<void> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE business_leads (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          source VARCHAR2(100) NOT NULL,
          name VARCHAR2(500),
          context CLOB,
          signal_strength VARCHAR2(20) DEFAULT ''low'',
          status VARCHAR2(50) DEFAULT ''new'',
          next_action VARCHAR2(1000),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    console.log('✅ business_leads table ready');
  } catch (err) {
    console.error('business_leads table error:', err);
  } finally {
    if (connection) await connection.close();
  }
}

async function saveLead(
  source: string,
  name: string,
  context: string,
  signalStrength: string = 'low',
  nextAction?: string
): Promise<string | null> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `INSERT INTO business_leads (source, name, context, signal_strength, next_action)
       VALUES (:source, :name, :context, :signalStrength, :nextAction)
       RETURNING RAWTOHEX(id) INTO :id`,
      {
        source,
        name: name || 'unknown',
        context,
        signalStrength,
        nextAction: nextAction || null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
      },
      { autoCommit: true }
    );
    const outBinds = result.outBinds as { id: string[] };
    return outBinds.id[0] || null;
  } catch (err) {
    console.error('❌ Save lead error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function updateLead(
  leadId: string,
  status: string,
  nextAction?: string
): Promise<boolean> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `UPDATE business_leads
       SET status = :status,
           next_action = :nextAction,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = HEXTORAW(:leadId)`,
      {
        status,
        nextAction: nextAction || null,
        leadId
      },
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error('❌ Update lead error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

async function getLeads(
  status?: string,
  limit: number = 20
): Promise<any[]> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    let query = `SELECT RAWTOHEX(id) as id, source, name, context, signal_strength,
                        status, next_action, created_at, updated_at
                 FROM business_leads`;
    const params: any = { limit };

    if (status) {
      query += ` WHERE status = :status`;
      params.status = status;
    }
    query += ` ORDER BY
      CASE signal_strength WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      created_at DESC
      FETCH FIRST :limit ROWS ONLY`;

    const result = await connection.execute(query, params);
    return result.rows || [];
  } catch (err) {
    console.error('❌ Get leads error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

// =============================================================================
// ESPALUZ FUNNEL — Track every user from trial → paid → churned
// =============================================================================

async function initEspaluzFunnelTable(): Promise<void> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE espaluz_funnel (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          user_id VARCHAR2(100) NOT NULL,
          channel VARCHAR2(50) NOT NULL,
          trial_start TIMESTAMP,
          trial_end TIMESTAMP,
          messages_sent NUMBER DEFAULT 0,
          last_active TIMESTAMP,
          converted NUMBER(1) DEFAULT 0,
          payment_status VARCHAR2(50) DEFAULT ''trial'',
          paypal_subscription_id VARCHAR2(100),
          retention_message_sent NUMBER(1) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    console.log('✅ espaluz_funnel table ready');
  } catch (err) {
    console.error('espaluz_funnel table error:', err);
  } finally {
    if (connection) await connection.close();
  }
}

async function upsertEspaluzUser(
  userId: string,
  channel: string,
  data: {
    trialStart?: Date;
    trialEnd?: Date;
    messagesSent?: number;
    lastActive?: Date;
    converted?: boolean;
    paymentStatus?: string;
    paypalSubscriptionId?: string;
    retentionMessageSent?: boolean;
  }
): Promise<boolean> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `MERGE INTO espaluz_funnel ef
       USING (SELECT :userId as user_id, :channel as channel FROM dual) src
       ON (ef.user_id = src.user_id AND ef.channel = src.channel)
       WHEN MATCHED THEN UPDATE SET
         messages_sent = NVL(:messagesSent, ef.messages_sent),
         last_active = NVL(:lastActive, ef.last_active),
         converted = NVL(:converted, ef.converted),
         payment_status = NVL(:paymentStatus, ef.payment_status),
         paypal_subscription_id = NVL(:paypalSubId, ef.paypal_subscription_id),
         retention_message_sent = NVL(:retentionSent, ef.retention_message_sent),
         updated_at = CURRENT_TIMESTAMP
       WHEN NOT MATCHED THEN INSERT
         (user_id, channel, trial_start, trial_end, messages_sent, last_active,
          converted, payment_status, paypal_subscription_id, retention_message_sent)
       VALUES (:userId, :channel, :trialStart, :trialEnd, :messagesSent, :lastActive,
               :converted, :paymentStatus, :paypalSubId, :retentionSent)`,
      {
        userId,
        channel,
        trialStart: data.trialStart || null,
        trialEnd: data.trialEnd || null,
        messagesSent: data.messagesSent ?? null,
        lastActive: data.lastActive || new Date(),
        converted: data.converted !== undefined ? (data.converted ? 1 : 0) : null,
        paymentStatus: data.paymentStatus || null,
        paypalSubId: data.paypalSubscriptionId || null,
        retentionSent: data.retentionMessageSent !== undefined ? (data.retentionMessageSent ? 1 : 0) : null
      },
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error('❌ Upsert EspaLuz user error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

async function getEspaluzExpiringTrials(daysAhead: number = 2): Promise<any[]> {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT RAWTOHEX(id) as id, user_id, channel, trial_start, trial_end,
              messages_sent, last_active, payment_status, retention_message_sent
       FROM espaluz_funnel
       WHERE payment_status = 'trial'
         AND trial_end IS NOT NULL
         AND trial_end BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '1' DAY * :daysAhead
         AND retention_message_sent = 0
       ORDER BY trial_end ASC`,
      { daysAhead }
    );
    return result.rows || [];
  } catch (err) {
    console.error('❌ Get expiring trials error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

async function getEspaluzFunnelSummary(): Promise<{
  total_users: number;
  active_trials: number;
  active_paid: number;
  churned: number;
  monthly_revenue: number;
  expiring_soon: number;
}> {
  let connection;
  const summary = {
    total_users: 0, active_trials: 0, active_paid: 0,
    churned: 0, monthly_revenue: 0, expiring_soon: 0
  };
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      `SELECT payment_status, COUNT(*) as cnt
       FROM espaluz_funnel
       GROUP BY payment_status`
    );
    if (result.rows) {
      for (const row of result.rows as any[]) {
        const [status, count] = row;
        const cnt = Number(count);
        summary.total_users += cnt;
        if (status === 'trial') summary.active_trials += cnt;
        else if (status === 'active') { summary.active_paid += cnt; summary.monthly_revenue += cnt * 7.77; }
        else if (status === 'churned' || status === 'cancelled') summary.churned += cnt;
      }
    }
    // Count expiring in next 2 days
    const expiring = await connection.execute(
      `SELECT COUNT(*) FROM espaluz_funnel
       WHERE payment_status = 'trial'
         AND trial_end BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '2' DAY`
    );
    if (expiring.rows && expiring.rows.length > 0) {
      summary.expiring_soon = Number((expiring.rows[0] as any[])[0]);
    }
    return summary;
  } catch (err) {
    console.error('❌ Get EspaLuz funnel summary error:', err);
    return summary;
  } finally {
    if (connection) await connection.close();
  }
}

// Initialize all tables (including new Wiring Build tables)
initLessonsTable();
initStrategicTable();
initHealthTable();
initConversationContextTable();
initKnowledgeBaseTable();
initAgentOutcomesTable();
initBusinessLeadsTable();
initEspaluzFunnelTable();

export {
  initializeDatabase,
  saveMemory,
  getRelevantMemory,
  // Tech debt
  addTechDebt,
  getTechDebt,
  resolveTechDebt,
  // Decisions
  addDecision,
  getDecisions,
  // Pending code
  savePendingCode,
  getPendingCode,
  clearPendingCode,
  // Alerts
  getAlertPreferences,
  setAlertPreferences,
  getAllAlertChatIds,
  // Lessons learned
  saveLesson,
  getLessons,
  getSuccessPatterns,
  // Strategic
  saveInsight,
  getActiveInsights,
  resolveInsight,
  // Health
  saveHealthCheck,
  getHealthHistory,
  // Conversation Context (Personal AI Upgrade)
  saveConversationContext,
  loadConversationContext,
  clearConversationContext,
  // Knowledge Base (Personal AI Upgrade)
  saveKnowledge,
  searchKnowledge,
  getKnowledgeByCategory,
  getKnowledgeByProject,
  getRecentKnowledge,
  // === WIRING BUILD (Week 1) ===
  // Agent Outcomes — cross-agent outcome tracking
  saveAgentOutcome,
  verifyAgentOutcome,
  getAgentOutcomes,
  getOutcomeSummary,
  // Business Leads — engagement signal tracking
  saveLead,
  updateLead,
  getLeads,
  // EspaLuz Funnel — trial → paid → churned tracking
  upsertEspaluzUser,
  getEspaluzExpiringTrials,
  getEspaluzFunnelSummary
};
