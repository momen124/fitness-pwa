#!/bin/bash
set -a
source /opt/n1-sync/.env
set +a

# Run the sync engine
node /var/www/fitness-pwa/sync_engine.js
