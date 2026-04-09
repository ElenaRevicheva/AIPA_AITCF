// Run on server: cd /home/ubuntu/cto-aipa && node scripts/oracle-resilience/check_hashnode_env.js
require("dotenv").config({ path: ".env", override: true });
console.log("HASHNODE_DAILY_ENABLED=", JSON.stringify(process.env.HASHNODE_DAILY_ENABLED));
