#!/usr/bin/env python3

# Read the file
with open('src/atuona-creative-ai.ts', 'r') as f:
    lines = f.readlines()

# Find the section to replace (around line 917)
new_section = '''      // Overwrite mode: use current page number directly
      let pageNum = bookState.currentPage;
      let fileSha: string | undefined;
      
      const pageId = String(pageNum).padStart(3, '0');
      
      // Check if file exists to get SHA for overwrite
      try {
        const { data: existingFile } = await octokit.repos.getContent({
          owner,
          repo: repoName,
          path: `metadata/${pageId}.json`,
          ref: branch
        });
        
        if ('sha' in existingFile) {
          fileSha = existingFile.sha;
          await ctx.reply(`⚠️ Page ${pageId} exists - OVERWRITING...`);
          console.log(`⚠️ Overwriting existing page ${pageId} with new content`);
        }
      } catch (e: any) {
        if (e.status === 404) {
          console.log(`📄 Page ${pageId} is new - creating...`);
        } else {
          throw e;
        }
      }
'''

# Find the start of the section to replace
start_idx = None
for i, line in enumerate(lines):
    if 'Find next available page number' in line:
        start_idx = i
        break

if start_idx is None:
    print("❌ Could not find the section to replace!")
    exit(1)

# Find the end (look for the line with "const pageId = String(pageNum)")
end_idx = None
for i in range(start_idx, min(start_idx + 50, len(lines))):
    if 'const pageId = String(pageNum).padStart(3' in lines[i] and i > start_idx + 20:
        end_idx = i + 1  # Include this line
        break

if end_idx is None:
    print("❌ Could not find the end of the section!")
    exit(1)

print(f"✅ Found section to replace: lines {start_idx+1} to {end_idx}")
print(f"   Removing {end_idx - start_idx} lines of broken logic")

# Replace the section
new_lines = lines[:start_idx] + [new_section + '\n'] + lines[end_idx:]

# Write back
with open('src/atuona-creative-ai.ts', 'w') as f:
    f.writelines(new_lines)

print(f"✅ Fixed! Replaced broken while loop with overwrite logic")
