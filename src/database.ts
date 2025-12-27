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
  getAllAlertChatIds
};
