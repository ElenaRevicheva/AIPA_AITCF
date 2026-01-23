#!/bin/bash
# Fix espaluz PostgreSQL password to match .env file
sudo -u postgres psql <<EOF
ALTER USER espaluz WITH PASSWORD 'espaluz_secure_2026';
EOF
echo "✅ Password updated to espaluz_secure_2026"
