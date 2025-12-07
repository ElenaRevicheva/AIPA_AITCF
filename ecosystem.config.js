module.exports = {
  apps: [{
    name: 'cto-aipa',
    script: 'dist/cto-aipa.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      TNS_ADMIN: '/home/ubuntu/cto-aipa/wallet'
    }
  }]
};
