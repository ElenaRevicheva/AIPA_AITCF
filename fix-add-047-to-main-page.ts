/**
 * Fix Script: Add Poem 047 "Лабиринты зрачков" to Main Page
 * 
 * Problem: Poem 047 only has a gallery slot but no NFT card with English translation
 * Solution: Add NFT card to VAULT section and update poems JSON
 * 
 * Run on Oracle Cloud server: npx ts-node fix-add-047-to-main-page.ts
 */

import { Octokit } from '@octokit/rest';
import * as dotenv from 'dotenv';

dotenv.config();

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const OWNER = 'ElenaRevicheva';
const REPO = 'atuona';
const BRANCH = 'main';

// The English translation from metadata/047.json
const ENGLISH_TRANSLATION = `The Eternity

Every glance quietly hides as Eternity in the labyrinths of your pupils.

Tender hands untouched by fatigue, daily scars not yet stitched into warm cheeks.

Eternity will pass before you say: "Forgive me..." Roses will wither. Orchids will shed their petals.

One day pearl stems will wrap around you whole. Like rings on fingers – nectars of their sweet resin. You'll feel Eternity. She'll touch your lips, grow warmer, and your word will forget belonging. Something will happen, spill like ocean over granite's endless shore. Something will happen. June will draw you with its scorching sting.

Frozen days... Eternity – she tempts.

22.06.2001`;

const RUSSIAN_TEXT = `Каждый взгляд тихо прячется Вечностью в лабиринтах твоих зрачков.

Нежных рук пока не коснулась усталость, и будни рубцы не зашили в теплые щеки.

Вечность пройдет, пока ты не скажешь: «Прости…». Пожухнут розы. Облетят орхидеи.

Однажды жемчужные стебли обовьют тебя всю. Как перстни на пальцах – нектары их сладкой смолы. Ты почувствуешь Вечность. Она коснется губ твоих, и станет теплее, и слово твое забудет причастность. Что-то случится, океаном прольется на безбрежье гранита. Что-то случится. Знойным жалом своим Тебя нарисует июнь.

Застывшие дни… Вечность – она искушает.

22.06.2001г.`;

// NFT card HTML for poem 047
const NFT_CARD_047 = `
                    <div class="nft-card">
                        <div class="nft-header">
                            <div class="nft-id">#047</div>
                            <div class="nft-status live">LIVE</div>
                        </div>
                        <div class="nft-content">
                            <h2 class="nft-title">Лабиринты зрачков</h2>
                            <div class="nft-verse" style="font-style: italic; color: var(--grey-light);">
                                <strong style="color: var(--silver-grey);">THE ETERNITY</strong><br><br>
                                Every glance quietly hides as Eternity<br>
                                in the labyrinths of your pupils.<br><br>
                                Tender hands untouched by fatigue,<br>
                                daily scars not yet stitched into warm cheeks.<br><br>
                                Eternity will pass before you say: "Forgive me..."<br>
                                Roses will wither. Orchids will shed their petals.<br><br>
                                One day pearl stems will wrap around you whole.<br>
                                Like rings on fingers – nectars of their sweet resin.<br>
                                You'll feel Eternity. She'll touch your lips,<br>
                                grow warmer, and your word will forget belonging.<br><br>
                                Something will happen, spill like ocean<br>
                                over granite's endless shore.<br>
                                Something will happen.<br>
                                June will draw you with its scorching sting.<br><br>
                                Frozen days... Eternity – she tempts.<br><br>
                                <em style="font-size: 0.85rem;">22.06.2001</em>
                            </div>
                            <div class="blockchain-badge">
                                <span>●</span> PRESERVED ON BLOCKCHAIN - DECEMBER 2025
                            </div>
                            <p class="nft-description">
                                A meditation on eternity and the fleeting nature of youth. Written in 2001, 
                                this prose poem captures moments before time leaves its marks – tender hands, 
                                warm cheeks, the promise of June. Underground poetry preserved forever.
                            </p>
                            <div class="nft-meta">
                                <div class="nft-price">FREE - GAS Only!</div>
                                <button class="nft-action" onclick="claimPoem('047', 'Лабиринты зрачков')">COLLECT SOUL</button>
                                <small style="color: var(--silver-grey); font-size: 0.7rem; margin-top: 0.5rem; display: block; font-family: 'JetBrains Mono', monospace;">Minimal fee covers blockchain preservation costs</small>
                            </div>
                        </div>
                    </div>
`;

async function addPoem047ToMainPage() {
  console.log('🔧 Adding poem 047 "Лабиринты зрачков" to main page...\n');

  // Step 1: Add NFT card to index.html
  console.log('1️⃣ Adding NFT card to index.html VAULT section...');
  try {
    const { data: htmlFile } = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: 'index.html',
      ref: BRANCH
    });

    if ('content' in htmlFile && 'sha' in htmlFile) {
      let htmlContent = Buffer.from(htmlFile.content, 'base64').toString('utf-8');
      
      // Check if 047 card already exists
      if (htmlContent.includes('#047') && htmlContent.includes('nft-card') && htmlContent.includes('Лабиринты зрачков')) {
        // Check if it's an nft-card, not just gallery slot
        if (htmlContent.includes('nft-id">#047')) {
          console.log('   ⏭️ NFT card 047 already exists');
        } else {
          // Find the last nft-card and add after it
          const lastCardMatch = htmlContent.lastIndexOf('</div>\n                    </div>\n\n                    <div class="nft-card">');
          
          if (lastCardMatch === -1) {
            // Alternative: find the nft-grid closing and insert before
            const nftGridEnd = htmlContent.indexOf('</div>\n            </section>\n\n            <section id="about"');
            if (nftGridEnd > 0) {
              // Find the last </div> that closes an nft-card before the section ends
              const searchArea = htmlContent.slice(0, nftGridEnd);
              const insertPoint = searchArea.lastIndexOf('</div>\n                </div>\n            </section>');
              
              if (insertPoint > 0) {
                // Insert before the nft-grid closes
                const actualInsert = searchArea.lastIndexOf('</div>\n                    </div>\n');
                if (actualInsert > 0) {
                  const insertAt = actualInsert + '</div>\n                    </div>\n'.length;
                  htmlContent = htmlContent.slice(0, insertAt) + NFT_CARD_047 + htmlContent.slice(insertAt);
                }
              }
            }
          } else {
            // Find the end of the last nft-card
            const lastCardEnd = htmlContent.indexOf('</div>\n                    </div>\n\n                </div>', lastCardMatch);
            if (lastCardEnd > 0) {
              const insertAt = lastCardEnd;
              // Actually find the closing of the last nft-card
              const searchAfterLastCard = htmlContent.slice(lastCardMatch);
              const endOfCard = searchAfterLastCard.indexOf('</div>\n                    </div>\n\n');
              if (endOfCard > 0) {
                const insertPoint = lastCardMatch + endOfCard + '</div>\n                    </div>\n'.length;
                htmlContent = htmlContent.slice(0, insertPoint) + NFT_CARD_047 + htmlContent.slice(insertPoint);
              }
            }
          }
          
          await octokit.repos.createOrUpdateFileContents({
            owner: OWNER,
            repo: REPO,
            path: 'index.html',
            message: '📖 Add NFT card for poem 047 "Лабиринты зрачков" with English translation',
            content: Buffer.from(htmlContent).toString('base64'),
            sha: htmlFile.sha,
            branch: BRANCH
          });
          console.log('   ✅ Added NFT card 047 to VAULT section');
        }
      } else {
        // Find where to insert - after the last nft-card in nft-grid
        // Look for pattern: end of last card before nft-grid closes
        const nftGridPattern = /<div class="nft-grid">/;
        const nftGridMatch = htmlContent.match(nftGridPattern);
        
        if (nftGridMatch) {
          // Find all nft-cards and insert after the last one
          const cards = htmlContent.match(/<div class="nft-card">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g);
          if (cards && cards.length > 0) {
            const lastCard = cards[cards.length - 1];
            const lastCardIndex = htmlContent.lastIndexOf(lastCard);
            const insertAt = lastCardIndex + lastCard.length;
            
            htmlContent = htmlContent.slice(0, insertAt) + '\n' + NFT_CARD_047 + htmlContent.slice(insertAt);
          } else {
            // Fallback: insert after nft-grid opening
            const gridStart = htmlContent.indexOf('<div class="nft-grid">');
            const insertAt = gridStart + '<div class="nft-grid">'.length;
            htmlContent = htmlContent.slice(0, insertAt) + '\n' + NFT_CARD_047 + htmlContent.slice(insertAt);
          }
          
          await octokit.repos.createOrUpdateFileContents({
            owner: OWNER,
            repo: REPO,
            path: 'index.html',
            message: '📖 Add NFT card for poem 047 "Лабиринты зрачков" with English translation',
            content: Buffer.from(htmlContent).toString('base64'),
            sha: htmlFile.sha,
            branch: BRANCH
          });
          console.log('   ✅ Added NFT card 047 to VAULT section');
        }
      }
    }
  } catch (e: any) {
    console.error('   ❌ Error:', e.message);
  }

  // Step 2: Add entry to atuona-45-poems-with-text.json
  console.log('\n2️⃣ Adding entry to atuona-45-poems-with-text.json...');
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
      
      // Check if 047 already exists
      const exists = poems.some((poem: any) => {
        const idAttr = poem.attributes?.find((a: any) => a.trait_type === 'ID');
        return idAttr?.value === '047';
      });
      
      if (exists) {
        console.log('   ⏭️ Entry 047 already exists in JSON');
      } else {
        // Add new entry
        const newEntry = {
          name: "Лабиринты зрачков #047",
          description: "ATUONA Gallery of Moments - Underground Poem 047. 'Лабиринты зрачков' (The Eternity) - A meditation on time and youth. Raw, unfiltered Russian poetry preserved on blockchain.",
          image: "https://fast-yottabyte-noisy.on-fleek.app/images/poem-047.png",
          attributes: [
            { trait_type: "Title", value: "Лабиринты зрачков" },
            { trait_type: "ID", value: "047" },
            { trait_type: "Collection", value: "GALLERY OF MOMENTS" },
            { trait_type: "Type", value: "Free Underground Poetry" },
            { trait_type: "Language", value: "Russian + English" },
            { trait_type: "Theme", value: "Eternity" },
            { trait_type: "Poem Text", value: RUSSIAN_TEXT },
            { trait_type: "English Translation", value: ENGLISH_TRANSLATION }
          ]
        };
        
        poems.push(newEntry);
        
        await octokit.repos.createOrUpdateFileContents({
          owner: OWNER,
          repo: REPO,
          path: 'atuona-45-poems-with-text.json',
          message: '📖 Add poem 047 "Лабиринты зрачков" with English translation to poems JSON',
          content: Buffer.from(JSON.stringify(poems, null, 2)).toString('base64'),
          sha: jsonFile.sha,
          branch: BRANCH
        });
        console.log('   ✅ Added entry 047 to poems JSON');
        console.log(`   📊 Total poems now: ${poems.length}`);
      }
    }
  } catch (e: any) {
    console.error('   ❌ Error:', e.message);
  }

  console.log('\n✅ Fix complete! Fleek will auto-deploy atuona.xyz in 1-2 minutes.');
  console.log('📖 Poem 047 "Лабиринты зрачков" now has English translation on main page.');
}

addPoem047ToMainPage().catch(console.error);
