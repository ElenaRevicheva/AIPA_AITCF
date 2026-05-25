import oracledb from 'oracledb';
import * as dotenv from 'dotenv';

dotenv.config();

// Set TNS_ADMIN BEFORE initializing Oracle Client (override in .env if wallet path differs)
process.env.TNS_ADMIN = process.env.TNS_ADMIN || '/home/ubuntu/cto-aipa/wallet';

// Thick mode with Oracle Instant Client — stable connections with wallet
try {
  oracledb.initOracleClient({ libDir: '/opt/instantclient_23_4' });
  console.log(`📁 TNS_ADMIN: ${process.env.TNS_ADMIN} (thick mode — Instant Client)`);
} catch (err: any) {
  if (!err.message?.includes('already been initialized')) {
    console.error('❌ Oracle Thick Mode error:', err.message?.slice(0, 200));
  }
}
oracledb.fetchAsString = [oracledb.CLOB];

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

/** ADB client wallet password (set when downloading wallet from OCI) — not the same as DB_USER password. */
function poolAttributes(): oracledb.PoolAttributes {
  const base: oracledb.PoolAttributes = {
    ...dbConfig,
    poolMin: 1,
    poolMax: 3,
    poolIncrement: 1,
    poolTimeout: 60,
    // Avoid minute-long silent waits when TLS is broken (Telegram looks "dead")
    queueTimeout: 15000,
  };
  const wp = process.env.WALLET_PASSWORD;
  if (wp) {
    // Encrypted ewallet.p12 — required or thick client returns ORA-28759 failure to open file
    (base as oracledb.PoolAttributes & { walletPassword?: string }).walletPassword = wp;
  }
  return base;
}

// Connection pool — Oracle ADB free tier ~3 sessions max
let _poolPromise: Promise<oracledb.Pool> | null = null;
let _pool: oracledb.Pool | null = null;

function getPool(): Promise<oracledb.Pool> {
  if (!_poolPromise) {
    _poolPromise = oracledb.createPool(poolAttributes()).then(pool => {
      _pool = pool;
      console.log('🔗 Oracle connection pool created (thick mode, max=3)');
      return pool;
    }).catch(err => {
      _poolPromise = null; // allow retry on next call
      _pool = null;
      throw err;
    });
  }
  return _poolPromise;
}

/** Tear down pool so it gets recreated fresh on next call (used after ORA-29024). */
async function resetPool(): Promise<void> {
  const p = _pool;
  _poolPromise = null;
  _pool = null;
  if (p) {
    try {
      await p.close(0);
    } catch {
      /* ignore close errors */
    }
  }
}

/**
 * Connection from pool with retries. ORA-29024 often clears after pool reset (wallet/TLS refresh).
 * NJS-040 / NJS-511 / ORA-12506: transient listener or pool exhaustion — short back-off.
 * (This was removed during Places work; restoring avoids noisy failures when ADB rotates material.)
 */
async function getPoolConnection(retries = 4): Promise<oracledb.Connection> {
  for (let i = 0; i < retries; i++) {
    try {
      const pool = await getPool();
      return await pool.getConnection();
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      const isCert = err.message?.includes('ORA-29024') || err.code === 'ORA-29024';
      const isTransient =
        err.code === 'NJS-511' ||
        err.code === 'NJS-040' ||
        err.message?.includes('ORA-12506');
      if (i < retries - 1 && (isCert || isTransient)) {
        const delay = isCert ? 5000 * (i + 1) : 3000 * (i + 1);
        console.warn(
          `⏳ Oracle connection retry ${i + 1}/${retries} (${isCert ? 'cert/TLS' : 'transient'})…`
        );
        if (isCert) await resetPool();
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Failed to get Oracle connection after retries');
}

async function initializeDatabase() {
  let connection;
  try {
    console.log(`🔌 Connecting to ${dbConfig.connectionString}...`);
    connection = await getPoolConnection();
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

    await initBusinessLeadsTable();
    await ensureBusinessLeadsUtmColumns();
  } catch (err: any) {
    console.error('❌ Database initialization error:', err?.message?.slice(0, 200));
    // Don't throw — let the server start; tables will be created on first use
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

async function saveMemory(aipaType: string, action: string, context: any, result: any, metadata: any) {
  let connection;
  try {
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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

async function deleteKnowledgeById(userId: number, id: string): Promise<boolean> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result = await connection.execute(
      `DELETE FROM knowledge_base WHERE RAWTOHEX(id) = :id AND user_id = :userId`,
      { id: id.toUpperCase(), userId }
    );
    await connection.commit();
    return (result.rowsAffected ?? 0) > 0;
  } catch (err) {
    console.error('❌ Delete knowledge error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

async function clearKnowledgeByCategory(userId: number, category: string): Promise<number> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result = await connection.execute(
      `DELETE FROM knowledge_base WHERE user_id = :userId AND category = :category`,
      { userId, category }
    );
    await connection.commit();
    return result.rowsAffected ?? 0;
  } catch (err) {
    console.error('❌ Clear knowledge error:', err);
    return 0;
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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

    const result = await connection.execute(query, params, {
      fetchInfo: {
        'ACTION_DETAIL': { type: oracledb.STRING },
        'OUTCOME_DETAIL': { type: oracledb.STRING }
      }
    });
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
    connection = await getPoolConnection();
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
// CONTENT LOG — Marketing engine (Daily blog + future channels)
// Roadmap: AIDEAZZ_AI_MARKETING_ENGINE_FULL_ROADMAP.md Phase 2
// =============================================================================

async function initContentLogTable(): Promise<void> {
  let connection;
  try {
    connection = await getPoolConnection();
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE content_log (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          channel VARCHAR2(40) NOT NULL,
          keyword VARCHAR2(500),
          title VARCHAR2(500) NOT NULL,
          url VARCHAR2(1000) NOT NULL,
          status VARCHAR2(40) DEFAULT ''published'',
          topic_index NUMBER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    console.log('✅ content_log table ready');
  } catch (err) {
    console.error('content_log table error:', err);
  } finally {
    if (connection) await connection.close();
  }
}

async function saveContentLog(params: {
  channel: string;
  keyword?: string;
  title: string;
  url: string;
  status?: string;
  topicIndex?: number;
}): Promise<string | null> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result = await connection.execute(
      `INSERT INTO content_log (channel, keyword, title, url, status, topic_index)
       VALUES (:channel, :keyword, :title, :url, :status, :topicIndex)
       RETURNING RAWTOHEX(id) INTO :id`,
      {
        channel: params.channel,
        keyword: params.keyword ?? null,
        title: params.title,
        url: params.url,
        status: params.status ?? 'published',
        topicIndex: params.topicIndex ?? null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
      },
      { autoCommit: true }
    );
    const outBinds = result.outBinds as { id: string[] };
    return outBinds.id[0] || null;
  } catch (err) {
    console.error('❌ saveContentLog error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function getRecentContentLogs(limit: number = 30): Promise<
  Array<{
    id: string;
    channel: string;
    keyword: string | null;
    title: string;
    url: string;
    status: string;
    topic_index: number | null;
    created_at: Date;
  }>
> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result = await connection.execute(
      `SELECT RAWTOHEX(id) as id, channel, keyword, title, url, status, topic_index, created_at
       FROM content_log
       ORDER BY created_at DESC
       FETCH FIRST :limit ROWS ONLY`,
      { limit },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return (result.rows as any[]) || [];
  } catch (err) {
    console.error('❌ getRecentContentLogs error:', err);
    return [];
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
    connection = await getPoolConnection();
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE business_leads (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          source VARCHAR2(100) NOT NULL,
          name VARCHAR2(500),
          contact_email VARCHAR2(500),
          context CLOB,
          signal_strength VARCHAR2(20) DEFAULT ''low'',
          status VARCHAR2(50) DEFAULT ''new'',
          next_action VARCHAR2(1000),
          utm_source VARCHAR2(200),
          utm_medium VARCHAR2(200),
          utm_campaign VARCHAR2(500),
          utm_term VARCHAR2(500),
          utm_content VARCHAR2(500),
          page_url VARCHAR2(2000),
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

/** Adds UTM + email columns on existing DBs (CREATE may have skipped if table already existed). */
async function ensureBusinessLeadsUtmColumns(): Promise<void> {
  const columns: Array<{ name: string; def: string }> = [
    { name: 'contact_email', def: 'VARCHAR2(500)' },
    { name: 'utm_source', def: 'VARCHAR2(200)' },
    { name: 'utm_medium', def: 'VARCHAR2(200)' },
    { name: 'utm_campaign', def: 'VARCHAR2(500)' },
    { name: 'utm_term', def: 'VARCHAR2(500)' },
    { name: 'utm_content', def: 'VARCHAR2(500)' },
    { name: 'page_url', def: 'VARCHAR2(2000)' },
  ];
  let connection;
  try {
    connection = await getPoolConnection();
    for (const col of columns) {
      await connection.execute(
        `
        BEGIN
          EXECUTE IMMEDIATE 'ALTER TABLE business_leads ADD (${col.name} ${col.def})';
        EXCEPTION
          WHEN OTHERS THEN
            IF SQLCODE != -1430 THEN RAISE; END IF;
        END;
        `,
        {},
        { autoCommit: true }
      );
    }
    console.log('✅ business_leads UTM columns ready');
  } catch (err) {
    console.error('business_leads UTM migration error:', err);
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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

async function saveMarketingInquiry(params: {
  name?: string;
  contactEmail?: string;
  message?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  page_url?: string;
}): Promise<string | null> {
  const source = 'aideazz_inquiry';
  const name = (params.name || '').trim() || 'unknown';
  const contactEmail = (params.contactEmail || '').trim() || null;
  const message = (params.message || '').trim();
  const context = message || '(no message)';
  let connection;
  try {
    connection = await getPoolConnection();
    const result = await connection.execute(
      `INSERT INTO business_leads (
         source, name, contact_email, context, signal_strength, status,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content, page_url
       )
       VALUES (
         :source, :name, :contactEmail, :context, :signalStrength, 'new',
         :utm_source, :utm_medium, :utm_campaign, :utm_term, :utm_content, :page_url
       )
       RETURNING RAWTOHEX(id) INTO :id`,
      {
        source,
        name,
        contactEmail,
        context,
        signalStrength: 'medium',
        utm_source: params.utm_source?.trim() || null,
        utm_medium: params.utm_medium?.trim() || null,
        utm_campaign: params.utm_campaign?.trim() || null,
        utm_term: params.utm_term?.trim() || null,
        utm_content: params.utm_content?.trim() || null,
        page_url: params.page_url?.trim()?.slice(0, 2000) || null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 },
      },
      { autoCommit: true }
    );
    const outBinds = result.outBinds as { id: string[] };
    return outBinds.id[0] || null;
  } catch (err) {
    console.error('❌ saveMarketingInquiry error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function getLeadsSinceForDigest(
  since: Date,
  sourceFilter: string = 'aideazz_inquiry'
): Promise<
  Array<{
    id: string;
    source: string;
    name: string | null;
    contact_email: string | null;
    context: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    page_url: string | null;
    created_at: Date;
  }>
> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result = await connection.execute(
      `SELECT RAWTOHEX(id) as id, source, name, contact_email, context,
              utm_source, utm_medium, utm_campaign, page_url, created_at
       FROM business_leads
       WHERE source = :sourceFilter AND created_at >= :since
       ORDER BY created_at DESC`,
      { sourceFilter, since },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { CONTEXT: { type: oracledb.STRING } },
      }
    );
    const raw = (result.rows as any[]) || [];
    return raw.map((row) => ({
      id: row.ID ?? row.id,
      source: row.SOURCE ?? row.source,
      name: row.NAME ?? row.name ?? null,
      contact_email: row.CONTACT_EMAIL ?? row.contact_email ?? null,
      context: row.CONTEXT ?? row.context ?? null,
      utm_source: row.UTM_SOURCE ?? row.utm_source ?? null,
      utm_medium: row.UTM_MEDIUM ?? row.utm_medium ?? null,
      utm_campaign: row.UTM_CAMPAIGN ?? row.utm_campaign ?? null,
      page_url: row.PAGE_URL ?? row.page_url ?? null,
      created_at: row.CREATED_AT ?? row.created_at,
    }));
  } catch (err) {
    console.error('❌ getLeadsSinceForDigest error:', err);
    return [];
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
    connection = await getPoolConnection();
    let query = `SELECT RAWTOHEX(id) as id, source, name, contact_email, context, signal_strength,
                        status, next_action, utm_source, utm_medium, utm_campaign,
                        utm_term, utm_content, page_url, created_at, updated_at
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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
    connection = await getPoolConnection();
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

// =============================================================================
// OUTREACH — Phase 4: Founder Cold Email Pipeline
// =============================================================================

async function initOutreachTargetsTable(): Promise<void> {
  let connection;
  try {
    connection = await getPoolConnection();
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE outreach_targets (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          name VARCHAR2(500) NOT NULL,
          company VARCHAR2(500),
          email VARCHAR2(500),
          email_status VARCHAR2(50) DEFAULT ''unverified'',
          linkedin_url VARCHAR2(2000),
          source VARCHAR2(200),
          pain_point CLOB,
          matched_system VARCHAR2(200),
          status VARCHAR2(50) DEFAULT ''new'',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    console.log('✅ outreach_targets table ready');
  } catch (err) {
    console.error('outreach_targets table error:', err);
  } finally {
    if (connection) await connection.close();
  }
}

async function initOutreachLogTable(): Promise<void> {
  let connection;
  try {
    connection = await getPoolConnection();
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE outreach_log (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          target_id RAW(16) NOT NULL,
          subject VARCHAR2(1000),
          body CLOB,
          sent_at TIMESTAMP,
          status VARCHAR2(50) DEFAULT ''draft'',
          opened NUMBER(1) DEFAULT 0,
          replied NUMBER(1) DEFAULT 0,
          reply_snippet VARCHAR2(2000),
          replied_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    console.log('✅ outreach_log table ready');
  } catch (err) {
    console.error('outreach_log table error:', err);
  } finally {
    if (connection) await connection.close();
  }
}

async function saveOutreachTarget(target: {
  name: string;
  company?: string;
  email?: string;
  emailStatus?: string;
  linkedinUrl?: string;
  source?: string;
  painPoint?: string;
  matchedSystem?: string;
}): Promise<string | null> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result = await connection.execute(
      `INSERT INTO outreach_targets
         (name, company, email, email_status, linkedin_url, source, pain_point, matched_system)
       VALUES (:name, :company, :email, :emailStatus, :linkedinUrl, :source, :painPoint, :matchedSystem)
       RETURNING RAWTOHEX(id) INTO :id`,
      {
        name: target.name,
        company: target.company || null,
        email: target.email || null,
        emailStatus: target.emailStatus || 'unverified',
        linkedinUrl: target.linkedinUrl || null,
        source: target.source || null,
        painPoint: target.painPoint || null,
        matchedSystem: target.matchedSystem || null,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
      },
      { autoCommit: true }
    );
    const outBinds = result.outBinds as { id: string[] };
    return outBinds.id[0] || null;
  } catch (err) {
    console.error('❌ saveOutreachTarget error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function updateOutreachTargetStatus(
  targetId: string,
  status: string,
  emailStatus?: string
): Promise<boolean> {
  let connection;
  try {
    connection = await getPoolConnection();
    const sets = ['status = :status', 'updated_at = CURRENT_TIMESTAMP'];
    const binds: Record<string, string> = { targetId, status };
    if (emailStatus !== undefined) {
      sets.push('email_status = :emailStatus');
      binds.emailStatus = emailStatus;
    }
    await connection.execute(
      `UPDATE outreach_targets SET ${sets.join(', ')} WHERE RAWTOHEX(id) = :targetId`,
      binds as unknown as Record<string, oracledb.BindParameter>,
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error('❌ updateOutreachTargetStatus error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

async function getOutreachTargets(params?: {
  status?: string;
  limit?: number;
}): Promise<any[]> {
  let connection;
  try {
    connection = await getPoolConnection();
    let sql = `SELECT RAWTOHEX(id) as id, name, company, email, email_status,
                      linkedin_url, source, pain_point, matched_system, status,
                      created_at, updated_at
               FROM outreach_targets`;
    const binds: Record<string, string | number> = {};
    if (params?.status) {
      sql += ' WHERE status = :status';
      binds.status = params.status;
    }
    sql += ' ORDER BY created_at DESC';
    if (params?.limit) {
      sql += ' FETCH FIRST :lim ROWS ONLY';
      binds.lim = params.limit;
    }
    const result = await connection.execute(sql, binds as unknown as Record<string, oracledb.BindParameter>);
    return result.rows || [];
  } catch (err) {
    console.error('❌ getOutreachTargets error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

async function saveOutreachEmail(params: {
  targetId: string;
  subject: string;
  body: string;
  status?: string;
}): Promise<string | null> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result = await connection.execute(
      `INSERT INTO outreach_log (target_id, subject, body, status, sent_at)
       VALUES (HEXTORAW(:targetId), :subject, :body, :status,
               CASE WHEN :status = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END)
       RETURNING RAWTOHEX(id) INTO :id`,
      {
        targetId: params.targetId,
        subject: params.subject,
        body: params.body,
        status: params.status || 'draft',
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
      },
      { autoCommit: true }
    );
    const outBinds = result.outBinds as { id: string[] };
    return outBinds.id[0] || null;
  } catch (err) {
    console.error('❌ saveOutreachEmail error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

async function markOutreachSent(emailId: string): Promise<boolean> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result = await connection.execute(
      `UPDATE outreach_log SET status = 'sent', sent_at = CURRENT_TIMESTAMP
       WHERE RAWTOHEX(id) = :emailId`,
      { emailId },
      { autoCommit: true }
    );
    const n = result.rowsAffected;
    const ok = typeof n === 'number' ? n > 0 : true;
    if (!ok) {
      console.error('❌ markOutreachSent: no row updated for emailId', emailId);
    }
    return ok;
  } catch (err) {
    console.error('❌ markOutreachSent error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

async function markOutreachReply(emailId: string, snippet: string): Promise<boolean> {
  let connection;
  try {
    connection = await getPoolConnection();
    await connection.execute(
      `UPDATE outreach_log SET replied = 1, reply_snippet = :snippet, replied_at = CURRENT_TIMESTAMP
       WHERE RAWTOHEX(id) = :emailId`,
      { emailId, snippet: snippet.slice(0, 2000) },
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error('❌ markOutreachReply error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

async function getOutreachSentToday(): Promise<number> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result = await connection.execute(
      `SELECT COUNT(*) FROM outreach_log
       WHERE status = 'sent' AND sent_at >= TRUNC(CURRENT_TIMESTAMP)`,
      {}
    );
    return result.rows ? Number((result.rows[0] as any[])[0]) : 0;
  } catch (err) {
    console.error('❌ getOutreachSentToday error:', err);
    return 0;
  } finally {
    if (connection) await connection.close();
  }
}

async function getOutreachStats(): Promise<{
  total_targets: number;
  total_sent: number;
  total_replies: number;
  sent_today: number;
  reply_rate: string;
}> {
  let connection;
  const stats = { total_targets: 0, total_sent: 0, total_replies: 0, sent_today: 0, reply_rate: '0%' };
  try {
    connection = await getPoolConnection();
    const tgt = await connection.execute('SELECT COUNT(*) FROM outreach_targets');
    stats.total_targets = tgt.rows ? Number((tgt.rows[0] as any[])[0]) : 0;

    const sent = await connection.execute(
      `SELECT COUNT(*) FROM outreach_log WHERE status = 'sent'`
    );
    stats.total_sent = sent.rows ? Number((sent.rows[0] as any[])[0]) : 0;

    const replies = await connection.execute(
      'SELECT COUNT(*) FROM outreach_log WHERE replied = 1'
    );
    stats.total_replies = replies.rows ? Number((replies.rows[0] as any[])[0]) : 0;

    const today = await connection.execute(
      `SELECT COUNT(*) FROM outreach_log
       WHERE status = 'sent' AND sent_at >= TRUNC(CURRENT_TIMESTAMP)`
    );
    stats.sent_today = today.rows ? Number((today.rows[0] as any[])[0]) : 0;

    if (stats.total_sent > 0) {
      stats.reply_rate = ((stats.total_replies / stats.total_sent) * 100).toFixed(1) + '%';
    }
    return stats;
  } catch (err) {
    console.error('❌ getOutreachStats error:', err);
    return stats;
  } finally {
    if (connection) await connection.close();
  }
}

async function getOutreachTargetByCompany(company: string): Promise<any | null> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result = await connection.execute(
      `SELECT RAWTOHEX(id) as id, name, company, email, status
       FROM outreach_targets
       WHERE LOWER(company) = :company
       FETCH FIRST 1 ROWS ONLY`,
      { company: company.toLowerCase() }
    );
    return result.rows && result.rows.length > 0 ? result.rows[0] : null;
  } catch (err) {
    console.error('❌ getOutreachTargetByCompany error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

/** Earliest sent_at in outreach_log — used to calculate warmup ramp week number. */
async function getFirstOutreachSendDate(): Promise<Date | null> {
  let connection;
  try {
    connection = await getPoolConnection();
    const r = await connection.execute(
      `SELECT MIN(sent_at) FROM outreach_log WHERE status = 'sent'`
    );
    const val = r.rows ? (r.rows[0] as any[])[0] : null;
    return val ? new Date(val) : null;
  } catch (err) {
    console.error('❌ getFirstOutreachSendDate error:', err);
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

/** Leads with no email set — shown in /pending_leads Telegram command. */
async function getPendingLeads(limit = 20): Promise<any[]> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result = await connection.execute(
      `SELECT RAWTOHEX(id) as id, name, company, email_status, source, pain_point, created_at
       FROM outreach_targets
       WHERE (email IS NULL OR email_status = 'missing')
         AND status NOT IN ('invalid_email', 'emailed')
       ORDER BY created_at DESC
       FETCH FIRST :limit ROWS ONLY`,
      { limit },
      { outFormat: 4002 /* OUT_FORMAT_OBJECT */ }
    );
    return (result.rows as any[]) || [];
  } catch (err) {
    console.error('❌ getPendingLeads error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

/** Set email on a target so it enters the send pipeline. */
async function updateTargetEmail(targetId: string, email: string): Promise<boolean> {
  let connection;
  try {
    connection = await getPoolConnection();
    await connection.execute(
      `UPDATE outreach_targets
       SET email = :email, email_status = 'unverified', updated_at = CURRENT_TIMESTAMP
       WHERE RAWTOHEX(id) = :id`,
      { email, id: targetId },
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error('❌ updateTargetEmail error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

/** Single round-trip dedup for Places ingest (avoids N× Oracle connection storms). */
async function getOutreachExistingCompaniesLowercase(companies: string[]): Promise<Set<string>> {
  const uniq = [...new Set(companies.map((c) => c.trim().toLowerCase()).filter(Boolean))];
  if (uniq.length === 0) return new Set();

  let connection;
  try {
    connection = await getPoolConnection();
    const binds: Record<string, string> = {};
    const placeholders = uniq.map((c, i) => {
      const k = `c${i}`;
      binds[k] = c;
      return `:${k}`;
    });
    const result = await connection.execute(
      `SELECT LOWER(company) AS lc FROM outreach_targets WHERE LOWER(company) IN (${placeholders.join(',')})`,
      binds
    );
    const set = new Set<string>();
    for (const row of (result.rows || []) as unknown[][]) {
      const v = row?.[0];
      if (v != null) set.add(String(v).toLowerCase());
    }
    return set;
  } catch (err) {
    console.error('❌ getOutreachExistingCompaniesLowercase error:', err);
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}

/** One connection, one commit — avoids N separate pool acquisitions per import. */
async function saveOutreachTargetsBulk(
  targets: Array<{
    name: string;
    company?: string | null;
    email?: string | null;
    emailStatus?: string;
    linkedinUrl?: string | null;
    source?: string | null;
    painPoint?: string | null;
    matchedSystem?: string | null;
  }>
): Promise<{ imported: number; ids: string[] }> {
  const ids: string[] = [];
  if (targets.length === 0) return { imported: 0, ids };

  let connection;
  try {
    connection = await getPoolConnection();
    for (const target of targets) {
      const result = await connection.execute(
        `INSERT INTO outreach_targets
           (name, company, email, email_status, linkedin_url, source, pain_point, matched_system)
         VALUES (:name, :company, :email, :emailStatus, :linkedinUrl, :source, :painPoint, :matchedSystem)
         RETURNING RAWTOHEX(id) INTO :id`,
        {
          name: target.name,
          company: target.company ?? null,
          email: target.email ?? null,
          emailStatus: target.emailStatus || 'unverified',
          linkedinUrl: target.linkedinUrl ?? null,
          source: target.source ?? null,
          painPoint: target.painPoint ?? null,
          matchedSystem: target.matchedSystem ?? null,
          id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 },
        },
        { autoCommit: false }
      );
      const outBinds = result.outBinds as { id: string[] };
      if (outBinds?.id?.[0]) ids.push(outBinds.id[0]!);
    }
    await connection.commit();
    return { imported: ids.length, ids };
  } catch (err) {
    console.error('❌ saveOutreachTargetsBulk error:', err);
    try {
      await connection?.rollback();
    } catch {
      /* ignore */
    }
    return { imported: 0, ids: [] };
  } finally {
    if (connection) await connection.close();
  }
}

async function getOutreachDrafts(): Promise<any[]> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result = await connection.execute(
      `SELECT RAWTOHEX(ol.id) as email_id, RAWTOHEX(ol.target_id) as target_id,
              ol.subject, ol.body, ol.status,
              ot.name, ot.company, ot.email
       FROM outreach_log ol
       JOIN outreach_targets ot ON ol.target_id = ot.id
       WHERE ol.status = 'draft'
       ORDER BY ol.created_at DESC`
    );
    return result.rows || [];
  } catch (err) {
    console.error('❌ getOutreachDrafts error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

// Initialize all tables sequentially (thin mode can't handle 10+ concurrent connections)
(async () => {
  try {
    await initLessonsTable();
    await initStrategicTable();
    await initHealthTable();
    await initConversationContextTable();
    await initKnowledgeBaseTable();
    await initAgentOutcomesTable();
    await initContentLogTable();
    await initEspaluzFunnelTable();
    await initOutreachTargetsTable();
    await initOutreachLogTable();
  } catch (e: any) {
    console.error('❌ Table init error:', e?.message?.slice(0, 200));
  }
})();

// ============================================================
// PHASE 5 — Lead Triage
// ============================================================

async function initLeadTriageTable() {
  let connection;
  try {
    connection = await getPoolConnection();
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE TABLE lead_triage (
          id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
          source_table VARCHAR2(50) NOT NULL,
          source_ref_id RAW(16),
          signal_type VARCHAR2(50) DEFAULT ''unknown'',
          urgency NUMBER(1) DEFAULT 1,
          deal_value VARCHAR2(50) DEFAULT ''unknown'',
          one_line_summary VARCHAR2(500),
          raw_context CLOB,
          source_name VARCHAR2(500),
          source_email VARCHAR2(500),
          status VARCHAR2(50) DEFAULT ''new'',
          classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    await connection.execute(`
      BEGIN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_lead_triage_urgency ON lead_triage(urgency DESC)';
      EXCEPTION WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
      END;
    `);
    await connection.commit();
    console.log('✅ lead_triage table ready');
  } catch (err) {
    console.error('lead_triage table error:', err);
  } finally {
    if (connection) await connection.close();
  }
}

async function saveTriagedLead(data: {
  source_table: string;
  source_ref_id: string;
  signal_type: string;
  urgency: number;
  deal_value: string;
  one_line_summary: string;
  raw_context: string;
  source_name: string;
  source_email: string;
}): Promise<void> {
  let connection;
  try {
    connection = await getPoolConnection();
    // Avoid duplicate triage of same source_ref_id
    const existing = await connection.execute(
      `SELECT COUNT(*) FROM lead_triage WHERE source_ref_id = HEXTORAW(:1) AND source_table = :2`,
      [data.source_ref_id.replace(/-/g, ''), data.source_table]
    );
    const count = (existing.rows as any[])[0]?.[0] || 0;
    if (count > 0) return;

    await connection.execute(
      `INSERT INTO lead_triage (source_table, source_ref_id, signal_type, urgency, deal_value, one_line_summary, raw_context, source_name, source_email)
       VALUES (:1, HEXTORAW(:2), :3, :4, :5, :6, :7, :8, :9)`,
      [
        data.source_table,
        data.source_ref_id.replace(/-/g, ''),
        data.signal_type,
        data.urgency,
        data.deal_value,
        data.one_line_summary.substring(0, 500),
        data.raw_context,
        (data.source_name || '').substring(0, 500),
        (data.source_email || '').substring(0, 500),
      ]
    );
    await connection.commit();
  } catch (err) {
    console.error('saveTriagedLead error:', err);
  } finally {
    if (connection) await connection.close();
  }
}

/** Snapshot for /leads/dashboard — Google Places → outreach_targets (separate from lead_triage). */
export interface PlacesPipelineSnapshot {
  totalFromPlaces: number;
  importedLast24h: number;
  importedLast7d: number;
  /** Newest first */
  recent: Array<{ label: string; source: string; createdAt: string }>;
}

async function getPlacesPipelineSnapshot(): Promise<PlacesPipelineSnapshot> {
  const empty: PlacesPipelineSnapshot = {
    totalFromPlaces: 0,
    importedLast24h: 0,
    importedLast7d: 0,
    recent: [],
  };
  let connection;
  try {
    connection = await getPoolConnection();
    const countPlaces = `FROM outreach_targets WHERE REGEXP_LIKE(NVL(source,' '), '^places_')`;
    const t = await connection.execute(`SELECT COUNT(*) ${countPlaces}`);
    const t24 = await connection.execute(
      `SELECT COUNT(*) ${countPlaces} AND created_at >= CURRENT_TIMESTAMP - NUMTODSINTERVAL(1, 'DAY')`
    );
    const t7 = await connection.execute(
      `SELECT COUNT(*) ${countPlaces} AND created_at >= CURRENT_TIMESTAMP - NUMTODSINTERVAL(7, 'DAY')`
    );
    const num = (rows: oracledb.Result<any> | undefined) =>
      rows?.rows?.length ? Number((rows.rows[0] as unknown[])[0]) : 0;
    empty.totalFromPlaces = num(t);
    empty.importedLast24h = num(t24);
    empty.importedLast7d = num(t7);

    const rec = await connection.execute(
      `SELECT NVL(company, name) AS label, source, created_at
       FROM outreach_targets
       WHERE REGEXP_LIKE(NVL(source,' '), '^places_')
       ORDER BY created_at DESC
       FETCH FIRST 25 ROWS ONLY`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const rows = (rec.rows || []) as Array<{ LABEL?: string; SOURCE?: string; CREATED_AT?: Date }>;
    for (const row of rows) {
      const ts = row.CREATED_AT;
      empty.recent.push({
        label: String(row.LABEL ?? '—'),
        source: String(row.SOURCE ?? '—'),
        createdAt: ts instanceof Date ? ts.toISOString() : String(ts ?? ''),
      });
    }
    return empty;
  } catch (err) {
    console.error('getPlacesPipelineSnapshot error:', err);
    return empty;
  } finally {
    if (connection) await connection.close();
  }
}

async function markLeadTriagePushed(sourceRefId: string): Promise<boolean> {
  // Mark a lead_triage row as 'pushed_to_hubspot' so it stops appearing in daily briefs.
  // sourceRefId should be the outreach_targets.id (or business_leads.id) as hex string
  // WITHOUT dashes. Returns true if a row was updated.
  let connection;
  try {
    connection = await getPoolConnection();
    const cleanId = sourceRefId.replace(/-/g, '');
    const result = await connection.execute(
      `UPDATE lead_triage
         SET status = 'pushed_to_hubspot', updated_at = SYSTIMESTAMP
       WHERE source_ref_id = HEXTORAW(:1)
         AND (status IS NULL OR status NOT IN ('pushed_to_hubspot', 'archived', 'dismissed'))`,
      [cleanId],
      { autoCommit: true } as oracledb.ExecuteOptions
    );
    const rowsAffected = (result as { rowsAffected?: number }).rowsAffected ?? 0;
    if (rowsAffected > 0) {
      console.log(`🎯 [triage] marked lead_triage ${cleanId.slice(0, 16)} as pushed_to_hubspot`);
    }
    return rowsAffected > 0;
  } catch (err) {
    console.warn('⚠️ markLeadTriagePushed error:', err);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

async function getTriagedLeads(status?: string, limit = 50): Promise<any[]> {
  let connection;
  try {
    connection = await getPoolConnection();
    const where = status ? `AND status = :2` : '';
    const params: any[] = status ? [limit, status] : [limit];
    const result = await connection.execute(
      `SELECT RAWTOHEX(id), source_table, source_ref_id, signal_type, urgency,
              deal_value, status, one_line_summary, source_name, source_email,
              classified_at
       FROM lead_triage
       WHERE 1=1 ${where}
       -- May 24 2026: hide leads already pushed to HubSpot (HubSpot becomes
       -- the source of truth for 'what to act on'; brief only shows fresh signal)
       AND (status IS NULL OR status NOT IN ('pushed_to_hubspot', 'archived', 'dismissed'))
       AND LOWER(source_name) NOT IN (
         'e2e','e2e2','typo','tytjyt','katarinar','hope','kate',
         'irina','maya','katya','marina','katerina','test','demo',
         'sample','fake','elena revicheva'
       )
       AND NOT REGEXP_LIKE(source_name, '^(e2e|test|demo|sample|fake)', 'i')
       ORDER BY urgency DESC, classified_at DESC
       FETCH FIRST :1 ROWS ONLY`,
      params
    );
    return (result.rows as any[]) || [];
  } catch (err) {
    console.error('getTriagedLeads error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

/** Delete test/fake entries from business_leads and their lead_triage rows. */
async function deleteTestBusinessLeads(names: string[]): Promise<{ blDeleted: number; trDeleted: number }> {
  let connection;
  try {
    connection = await getPoolConnection();
    let blDeleted = 0;
    for (const name of names) {
      const r = await connection.execute(
        `DELETE FROM business_leads WHERE LOWER(name) = :n`,
        [name.toLowerCase()],
        { autoCommit: false }
      );
      blDeleted += (r.rowsAffected || 0);
    }
    // Remove their triage rows by name (source_name column)
    const placeholders = names.map((_, i) => `:n${i}`).join(',');
    const binds: Record<string, string> = {};
    names.forEach((n, i) => { binds[`n${i}`] = n; });
    const r2 = await connection.execute(
      `DELETE FROM lead_triage WHERE source_table = 'business_leads' AND LOWER(source_name) IN (${names.map(n => `'${n.toLowerCase().replace(/'/g, "''")}'`).join(',')})`,
      [],
      { autoCommit: false }
    );
    const trDeleted = r2.rowsAffected || 0;
    await connection.commit();
    return { blDeleted, trDeleted };
  } catch (err) {
    if (connection) await (connection as any).rollback?.();
    console.error('❌ deleteTestBusinessLeads error:', err);
    return { blDeleted: 0, trDeleted: 0 };
  } finally {
    if (connection) await connection.close();
  }
}

async function getUntriagedLeads(limit = 50): Promise<any[]> {
  let connection;
  try {
    connection = await getPoolConnection();
    // Pull business_leads not yet in lead_triage
    // Exclude obvious test / demo entries by name pattern so they never surface in triage
    // even if /cleanbiz confirm has not been run yet.
    const result = await connection.execute(
      `SELECT RAWTOHEX(bl.id), bl.name, bl.contact_email, bl.context, bl.utm_source
       FROM business_leads bl
       WHERE NOT EXISTS (
         SELECT 1 FROM lead_triage lt
         WHERE lt.source_ref_id = bl.id AND lt.source_table = 'business_leads'
       )
       AND LOWER(bl.name) NOT IN (
         'e2e','e2e2','typo','tytjyt','katarinar','hope','kate',
         'irina','maya','katya','marina','katerina','test','demo',
         'sample','fake','elena revicheva'
       )
       AND REGEXP_LIKE(bl.name, '^[A-Za-z0-9]', 'i')
       ORDER BY bl.created_at DESC
       FETCH FIRST :1 ROWS ONLY`,
      [limit]
    );
    return (result.rows as any[]) || [];
  } catch (err) {
    console.error('getUntriagedLeads error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

async function getRepliedOutreach(limit = 20): Promise<any[]> {
  let connection;
  try {
    connection = await getPoolConnection();
    // Pull outreach replies not yet triaged
    const result = await connection.execute(
      `SELECT RAWTOHEX(ol.id), ot.name, ot.email, ol.subject, ol.reply_snippet
       FROM outreach_log ol
       JOIN outreach_targets ot ON ot.id = ol.target_id
       WHERE ol.replied = 1
       AND NOT EXISTS (
         SELECT 1 FROM lead_triage lt
         WHERE lt.source_ref_id = ol.id AND lt.source_table = 'outreach_log'
       )
       ORDER BY ol.replied_at DESC
       FETCH FIRST :1 ROWS ONLY`,
      [limit]
    );
    return (result.rows as any[]) || [];
  } catch (err) {
    console.error('getRepliedOutreach error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

/**
 * Pull outreach_targets that:
 *  - have a real (non-pattern) email, OR a pain_point already classified
 *  - have NOT yet been saved to lead_triage with source_table='outreach_targets'
 *
 * These are the fresh prospects from HN Hiring / GitHub / Product Hunt ingestion.
 * They contain pain_point + matched_system already filled by Claude Haiku during
 * ingest, so triage can use that as context for scoring.
 */
async function getUntriagedOutreachTargets(limit = 50): Promise<any[]> {
  let connection;
  try {
    connection = await getPoolConnection();
    const result = await connection.execute(
      `SELECT RAWTOHEX(ot.id), ot.name, ot.company, ot.email, ot.source,
              ot.pain_point, ot.matched_system, ot.status, ot.email_status
       FROM outreach_targets ot
       WHERE NOT EXISTS (
         SELECT 1 FROM lead_triage lt
         WHERE lt.source_ref_id = HEXTORAW(RAWTOHEX(ot.id))
           AND lt.source_table = 'outreach_targets'
       )
       AND (
         (ot.email IS NOT NULL AND ot.email NOT LIKE 'founder@%' AND ot.email LIKE '%@%')
         OR ot.pain_point IS NOT NULL
       )
       ORDER BY ot.created_at DESC
       FETCH FIRST :1 ROWS ONLY`,
      [limit]
    );
    return (result.rows as any[]) || [];
  } catch (err) {
    console.error('getUntriagedOutreachTargets error:', err);
    return [];
  } finally {
    if (connection) await connection.close();
  }
}

initLeadTriageTable().catch((e: any) => console.error('❌ Lead triage table init error:', e?.message?.slice(0, 200)));

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
  deleteKnowledgeById,
  clearKnowledgeByCategory,
  // === WIRING BUILD (Week 1) ===
  // Agent Outcomes — cross-agent outcome tracking
  saveAgentOutcome,
  verifyAgentOutcome,
  getAgentOutcomes,
  getOutcomeSummary,
  // Content log — marketing publishes (Daily blog: dev.to + aideazz.xyz)
  saveContentLog,
  getRecentContentLogs,
  // Business Leads — engagement signal tracking
  saveLead,
  saveMarketingInquiry,
  updateLead,
  getLeads,
  getLeadsSinceForDigest,
  // EspaLuz Funnel — trial → paid → churned tracking
  upsertEspaluzUser,
  getEspaluzExpiringTrials,
  getEspaluzFunnelSummary,
  // === PHASE 4 — Founder Outreach Pipeline ===
  saveOutreachTarget,
  updateOutreachTargetStatus,
  getOutreachTargets,
  getOutreachTargetByCompany,
  getOutreachExistingCompaniesLowercase,
  saveOutreachTargetsBulk,
  saveOutreachEmail,
  markOutreachSent,
  markOutreachReply,
  getOutreachSentToday,
  getOutreachStats,
  getOutreachDrafts,
  getFirstOutreachSendDate,
  getPendingLeads,
  updateTargetEmail,
  deleteTestBusinessLeads,
  // === PHASE 5 — Lead Triage ===
  saveTriagedLead,
  getTriagedLeads,
  getUntriagedLeads,
  getUntriagedOutreachTargets,
  getRepliedOutreach,
  getPlacesPipelineSnapshot,
  markLeadTriagePushed,
};
