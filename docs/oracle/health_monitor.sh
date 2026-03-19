#!/bin/bash
# Health monitor - checks and logs system status

LOG_FILE=/home/ubuntu/health.log
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Check memory
MEM_FREE=$(free -m | awk '/Mem:/ {print $4}')
MEM_PERCENT=$(free | awk '/Mem:/ {printf "%.0f", $3/$2*100}')

# Check disk
DISK_PERCENT=$(df / | awk 'NR==2 {gsub(/%/,""); print $5}')

# Log status
echo "$DATE | MEM: ${MEM_PERCENT}% used (${MEM_FREE}MB free) | DISK: ${DISK_PERCENT}% used" >> $LOG_FILE

# Alert if memory > 85%
if [ $MEM_PERCENT -gt 85 ]; then
    echo "$DATE | WARNING: High memory usage: ${MEM_PERCENT}%" >> $LOG_FILE
fi

# Alert if disk > 80%
if [ $DISK_PERCENT -gt 80 ]; then
    echo "$DATE | WARNING: High disk usage: ${DISK_PERCENT}%" >> $LOG_FILE
fi

# Keep only last 1000 lines
tail -1000 $LOG_FILE > $LOG_FILE.tmp && mv $LOG_FILE.tmp $LOG_FILE
