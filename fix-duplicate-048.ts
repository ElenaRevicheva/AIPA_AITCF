/**
 * Fix Script: Remove Duplicate Poem 048
 * 
 * Problem: The same poem "Лабиринты зрачков" was published twice as both 047 and 048.
 * Solution: Keep 047 (correct), remove 048 (duplicate)
 * 
 * Run on Oracle Cloud server: npx ts-node fix-duplicate-048.ts
 */

import { Octokit } from '@octokit/rest';
import * as dotenv from 'dotenv';

dotenv.config();

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const OWNER = 'ElenaRevicheva';
const REPO = 'atuona';
const BRANCH = 'main';

async function fixDuplicate048() {
  console.log('🔧 Fixing duplicate poem 048...\n');

  // Step 1: Delete metadata/048.json
  console.log('1️⃣ Deleting metadata/048.json...');
  try {
    const { data: file048 } = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: 'metadata/048.json',
      ref: BRANCH
    });

    if ('sha' in file048) {
      await octokit.repos.deleteFile({
        owner: OWNER,
        repo: REPO,
        path: 'metadata/048.json',
        message: '🗑️ Remove duplicate poem 048 (same as 047 "Лабиринты зрачков")',
        sha: file048.sha,
        branch: BRANCH
      });
      console.log('   ✅ Deleted metadata/048.json');
    }
  } catch (e: any) {
    if (e.status === 404) {
      console.log('   ⏭️ metadata/048.json already deleted');
    } else {
      console.error('   ❌ Error:', e.message);
    }
  }

  // Step 2: Remove slot 048 from index.html
  console.log('\n2️⃣ Removing slot 048 from index.html...');
  try {
    const { data: htmlFile } = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: 'index.html',
      ref: BRANCH
    });

    if ('content' in htmlFile && 'sha' in htmlFile) {
      let htmlContent = Buffer.from(htmlFile.content, 'base64').toString('utf-8');
      
      // Find and remove the slot 048 block
      const slot048Pattern = /\s*<div class="gallery-slot" onclick="claimPoem\(48,[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*(?=<div class="gallery-slot"|<\/div>\s*<\/div>\s*<\/section>)/;
      
      if (htmlContent.match(slot048Pattern)) {
        htmlContent = htmlContent.replace(slot048Pattern, '\n                        ');
        
        await octokit.repos.createOrUpdateFileContents({
          owner: OWNER,
          repo: REPO,
          path: 'index.html',
          message: '🗑️ Remove duplicate gallery slot 048',
          content: Buffer.from(htmlContent).toString('base64'),
          sha: htmlFile.sha,
          branch: BRANCH
        });
        console.log('   ✅ Removed slot 048 from index.html');
      } else {
        // Try alternative pattern
        const altPattern = /<div class="gallery-slot" onclick="claimPoem\(48, 'Лабиринты зрачков'\)">[\s\S]*?<\/div>\s*<\/div>/;
        if (htmlContent.match(altPattern)) {
          htmlContent = htmlContent.replace(altPattern, '');
          
          await octokit.repos.createOrUpdateFileContents({
            owner: OWNER,
            repo: REPO,
            path: 'index.html',
            message: '🗑️ Remove duplicate gallery slot 048',
            content: Buffer.from(htmlContent).toString('base64'),
            sha: htmlFile.sha,
            branch: BRANCH
          });
          console.log('   ✅ Removed slot 048 from index.html (alt pattern)');
        } else {
          console.log('   ⏭️ Slot 048 not found or already removed');
        }
      }
    }
  } catch (e: any) {
    console.error('   ❌ Error:', e.message);
  }

  // Step 3: Remove entry 048 from atuona-45-poems-with-text.json
  console.log('\n3️⃣ Removing entry 048 from atuona-45-poems-with-text.json...');
  try {
    const { data: jsonFile } = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: 'atuona-45-poems-with-text.json',
      ref: BRANCH
    });

    if ('content' in jsonFile && 'sha' in jsonFile) {
      const jsonContent = Buffer.from(jsonFile.content, 'base64').toString('utf-8');
      const poems = JSON.parse(jsonContent);
      
      // Filter out entry with ID 048
      const filteredPoems = poems.filter((poem: any) => {
        const idAttr = poem.attributes?.find((a: any) => a.trait_type === 'ID');
        return idAttr?.value !== '048';
      });
      
      if (filteredPoems.length < poems.length) {
        await octokit.repos.createOrUpdateFileContents({
          owner: OWNER,
          repo: REPO,
          path: 'atuona-45-poems-with-text.json',
          message: '🗑️ Remove duplicate entry 048 from poems JSON',
          content: Buffer.from(JSON.stringify(filteredPoems, null, 2)).toString('base64'),
          sha: jsonFile.sha,
          branch: BRANCH
        });
        console.log('   ✅ Removed entry 048 from poems JSON');
        console.log(`   📊 Poems: ${poems.length} → ${filteredPoems.length}`);
      } else {
        console.log('   ⏭️ Entry 048 not found in JSON');
      }
    }
  } catch (e: any) {
    console.error('   ❌ Error:', e.message);
  }

  console.log('\n✅ Fix complete! Fleek will auto-deploy atuona.xyz in 1-2 minutes.');
  console.log('📖 Poem 047 "Лабиринты зрачков" is now the only version.');
}

fixDuplicate048().catch(console.error);
