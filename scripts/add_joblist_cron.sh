#!/bin/bash
# Add cron to run job-list-filter pipeline every 6 hours (for VibeJob Hunter priority sync).
# Run on Oracle as ubuntu. Creates priority_companies_for_vibejob.json for auto-sync.
MARKER="# job-list-filter priority export"
CRON_LINE="0 */6 * * * cd /home/ubuntu/job-list-filter && ./run_shortlist.sh >> /var/log/joblist-pipeline.log 2>&1"
if crontab -l 2>/dev/null | grep -q "job-list-filter"; then
  echo "Job-list cron already present"
else
  (crontab -l 2>/dev/null; echo "$MARKER"; echo "$CRON_LINE") | crontab -
  echo "Added: job-list pipeline every 6h"
fi
sudo touch /var/log/joblist-pipeline.log 2>/dev/null || true
sudo chown ubuntu:ubuntu /var/log/joblist-pipeline.log 2>/dev/null || true
