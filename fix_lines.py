#!/usr/bin/env python3

with open('src/atuona-creative-ai.ts', 'r') as f:
    lines = f.readlines()

# The fix: replace lines 917-948 (based on your document)
# Find the exact line with "Find next available page number"
start_line = None
for i, line in enumerate(lines):
    if 'Find next available page number' in line and i > 900 and i < 930:
        start_line = i
        print(f"Found at line {i+1}: {line.strip()}")
        break

if start_line is None:
    print("ERROR: Could not find 'Find next available page number'")
    print("Searching for alternative markers...")
    for i, line in enumerate(lines[900:930], start=900):
        if 'pageNum = bookState.currentPage' in line:
            print(f"Line {i+1}: {line.strip()}")
    exit(1)

# Find the end - look for "const pageId = String(pageNum)" that comes AFTER the while loop
end_line = None
for i in range(start_line + 20, min(start_line + 40, len(lines))):
    if 'const pageId = String(pageNum).padStart' in lines[i]:
        end_line = i
        print(f"Found end at line {i+1}: {lines[i].strip()}")
        break

if end_line is None:
    print("ERROR: Could not find end of section")
    exit(1)

# The replacement code
replacement = '''      // Overwrite mode: use current page number directly
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

print(f"\nReplacing lines {start_line+1} to {end_line+1} ({end_line - start_line + 1} lines)")

# Do the replacement
new_lines = lines[:start_line] + [replacement + '\n'] + lines[end_line+1:]

# Save
with open('src/atuona-creative-ai.ts', 'w') as f:
    f.writelines(new_lines)

print("✅ Fixed! Removed while loop, added overwrite logic")
