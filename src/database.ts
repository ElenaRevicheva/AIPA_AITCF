import oracledb from 'oracledb';
import * as dotenv from 'dotenv';

dotenv.config();

interface DBConfig {
  user: string;
  password: string;
  connectString: string;
}

const dbConfig: DBConfig = {
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  connectString: process.env.DB_CONNECTION_STRING!
};

async function initializeDatabase() {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    console.log('🔗 Connected to Oracle Autonomous Database');
    
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS aipa_memory (
        id RAW(16) DEFAULT SYS_GUID() PRIMARY KEY,
        aipa_type VARCHAR2(50) NOT NULL,
        action VARCHAR2(100) NOT NULL,
        context CLOB,
        result CLOB,
        metadata CLOB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Database schema initialized');
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

export { initializeDatabase, saveMemory, getRelevantMemory };
