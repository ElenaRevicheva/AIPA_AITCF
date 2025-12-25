/**
 * Fix: Add NFT Card #047 "Лабиринты зрачков" to Main Page VAULT
 * 
 * Run on Oracle Cloud: npx ts-node fix-add-047-card.ts
 */

import { Octokit } from '@octokit/rest';
import * as dotenv from 'dotenv';

dotenv.config();

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const OWNER = 'ElenaRevicheva';
const REPO = 'atuona';
const BRANCH = 'main';

// NFT Card HTML for poem 047
const NFT_CARD_047 = `
                    <div class="nft-card">
                        <div class="nft-header">
                            <div class="nft-id">#047</div>
                            <div class="nft-status live">LIVE</div>
                        </div>
                        <div class="nft-content">
                            <h2 class="nft-title">Лабиринты зрачков</h2>
                            <div class="nft-verse">
                                <strong>THE ETERNITY</strong><br><br>
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
                                <em>22.06.2001</em> ●
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
                            </div>
                        </div>
                    </div>

`;

async function addCard047() {
  console.log('🔧 Adding NFT card #047 to main page VAULT...\n');

  try {
    const { data: htmlFile } = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: 'index.html',
      ref: BRANCH
    });

    if (!('content' in htmlFile) || !('sha' in htmlFile)) {
      console.log('❌ Could not read index.html');
      return;
    }

    let html = Buffer.from(htmlFile.content, 'base64').toString('utf-8');

    // Check if #047 card already exists
    if (html.includes('nft-id">#047')) {
      console.log('⏭️ NFT card #047 already exists!');
      return;
    }

    // Find the marker after card #046 - look for the closing pattern
    // The pattern after card 046: "...провода.... ●" followed by closing divs
    const marker = 'И в проволоку колючую - Обрезанные в нем все, все, все провода.... ●';
    const markerIndex = html.indexOf(marker);
    
    if (markerIndex === -1) {
      console.log('❌ Could not find card #046 marker');
      return;
    }

    // Find the end of card #046 (look for </div> pattern after the marker)
    // After the marker, we have: </div> (nft-verse), blockchain-badge, description, nft-meta, </div> (nft-content), </div> (nft-card)
    const afterMarker = html.slice(markerIndex);
    
    // Find the pattern that closes card 046 and the grid
    const cardEndPattern = '</div>\n                            <div class="nft-meta">';
    const metaStart = afterMarker.indexOf(cardEndPattern);
    
    if (metaStart === -1) {
      // Try alternative approach - find the closing </section> after card 046
      const sectionEnd = '</section>\n\n            <section id="about"';
      const sectionIndex = html.indexOf(sectionEnd, markerIndex);
      
      if (sectionIndex === -1) {
        console.log('❌ Could not find insertion point');
        return;
      }
      
      // Go backwards to find where to insert (after the last </div> before </section>)
      // Find the "</div>\n                </div>\n            </section>" pattern
      const closingPattern = '</div>\n                </div>\n            </section>';
      const closingIndex = html.lastIndexOf(closingPattern, sectionIndex + 50);
      
      if (closingIndex === -1) {
        console.log('❌ Could not find grid closing pattern');
        return;
      }
      
      // Insert the new card just before the grid closes
      // We need to insert after the last nft-card's closing </div>
      // The pattern is: </div></div></div> then newlines then </div></section>
      
      // Find the actual closing of card 046 (three </div> tags)
      const card046End = html.lastIndexOf('</div>\n                        \n                        </div>\n                        </div>\n                    </div>', closingIndex);
      
      if (card046End > 0) {
        const insertAt = card046End + '</div>\n                        \n                        </div>\n                        </div>\n                    </div>'.length;
        html = html.slice(0, insertAt) + NFT_CARD_047 + html.slice(insertAt);
      } else {
        // Simpler approach: find the closing of nft-grid and insert before it
        const gridClose = '</div>\n                </div>\n            </section>\n\n            <section id="about"';
        const gridCloseIndex = html.indexOf(gridClose);
        
        if (gridCloseIndex > 0) {
          html = html.slice(0, gridCloseIndex) + NFT_CARD_047 + '                ' + html.slice(gridCloseIndex);
        } else {
          console.log('❌ Could not find any valid insertion point');
          return;
        }
      }
    } else {
      // Found the meta section, now find the card closing after it
      const fullMarkerIndex = markerIndex + metaStart;
      const remainingHtml = html.slice(fullMarkerIndex);
      
      // Find the end of this card (the </div>\n                    </div> that closes nft-card)
      const cardClose = remainingHtml.indexOf('</div>\n                    </div>\n                </div>\n            </section>');
      
      if (cardClose > 0) {
        // Insert before the grid closes (after the card closes)
        const endOfCard = remainingHtml.indexOf('</div>\n                    </div>');
        if (endOfCard > 0) {
          const insertAt = fullMarkerIndex + endOfCard + '</div>\n                    </div>'.length;
          html = html.slice(0, insertAt) + '\n' + NFT_CARD_047 + html.slice(insertAt);
        }
      }
    }

    // Verify we added it
    if (!html.includes('nft-id">#047')) {
      console.log('❌ Failed to insert card - trying direct approach...');
      
      // Direct approach: find </section> for home section and insert card before grid closes
      const homeSection = html.indexOf('</section>\n\n            <section id="about"');
      if (homeSection > 0) {
        // Go back and find </div>\n                </div> before it
        const searchArea = html.slice(0, homeSection);
        const lastGridDiv = searchArea.lastIndexOf('</div>\n                </div>');
        
        if (lastGridDiv > 0) {
          html = searchArea.slice(0, lastGridDiv) + NFT_CARD_047 + '                    ' + html.slice(lastGridDiv);
        }
      }
    }

    // Final check
    if (!html.includes('nft-id">#047')) {
      console.log('❌ All insertion attempts failed');
      return;
    }

    await octokit.repos.createOrUpdateFileContents({
      owner: OWNER,
      repo: REPO,
      path: 'index.html',
      message: '📖 Add NFT card #047 "Лабиринты зрачков" with English translation to VAULT',
      content: Buffer.from(html).toString('base64'),
      sha: htmlFile.sha,
      branch: BRANCH
    });

    console.log('✅ Added NFT card #047 to main page!');
    console.log('🌐 Fleek will deploy in 1-2 minutes.');

  } catch (e: any) {
    console.error('❌ Error:', e.message);
  }
}

addCard047().catch(console.error);
