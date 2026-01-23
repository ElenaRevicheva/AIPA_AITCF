#!/bin/bash
# Fix espaluz PostgreSQL password
sudo -u postgres psql <<EOF
ALTER USER espaluz WITH PASSWORD 'EspaLuz2026!';
GRANT ALL PRIVILEGES ON DATABASE espaluz_unified TO espaluz;
GRANT ALL PRIVILEGES ON DATABASE espaluz_telegram TO espaluz;
GRANT ALL PRIVILEGES ON DATABASE espaluz_whatsapp TO espaluz;
EOF
echo "✅ Password and permissions updated"
