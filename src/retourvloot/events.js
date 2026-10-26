// ================= Retourvloot — historical events =================
// Each event: at [y,m,d], title, body(S) -> html, choices [{label, hint, fx(S) -> outcome text}], history (what actually happened)
const EVENTS = [
  {
    id: 'founding', at: [1602, 3, 20],
    title: 'The United East India Company',
    body: () => `<p>The States General have granted the <i>Vereenigde Oostindische Compagnie</i> a charter (<i>octrooi</i>) for 21 years. It holds the Dutch monopoly on trade east of the Cape of Good Hope and may build forts, sign treaties and wage war in Asia.</p>
      <p>Investors have paid in <b>ƒ6.4 million</b>. You sit as a <i>bewindhebber</i>, a director of the Amsterdam chamber.</p>
      <p>Your job: equip ships, send silver east, sell what comes back at auction, and keep the shareholders paid. Your orders to Asia travel by ship. They take most of a year to arrive, and the answer takes as long again.</p>`,
    choices: [{ label: 'Take your seat' }],
    history: 'The charter gave a trading company powers normally held by states. Shareholders had no vote and never met; directors were appointed for life. In 1612 the planned ten-year liquidation was dropped, and the capital became permanent.',
  },
  {
    id: 'lemaire', at: [1609, 1, 24],
    title: 'A former director turns against the Company',
    onTrigger: S => { S.sent -= 0.1; },
    body: () => `<p>Isaac Le Maire, one of the Company's founders, has fallen out with the board. He petitions against the directors and quietly organises a syndicate to sell VOC shares <i>short</i>, betting that the price will fall. The price is sliding.</p>`,
    choices: [
      { label: 'Ask the States General to ban short selling', fx: S => { S.sent += 0.06; return 'The States General issue a ban. The market steadies.'; } },
      { label: 'Let the market settle it', fx: S => { S.sent -= 0.04; return 'The selling continues for months.'; } },
    ],
    history: 'In 1610 the States General banned naked short selling of VOC shares, the first such ban in history. Le Maire left Amsterdam and later backed a rival expedition that found a new route around Cape Horn.',
  },
  {
    id: 'firstdiv', at: [1610, 4, 20],
    title: 'The first dividend',
    body: S => `<p>Eight years in, the shareholders want a return. The treasury is thin, but the warehouses hold spices.</p><p>Fine spices in store: <b>${num(S.wh.fine)} t</b>.</p>`,
    choices: [
      { label: 'Pay in mace, worth 75% of capital', hint: 'No cash out. Shareholders get spices they must sell themselves.', fx: S => { S.wh.fine = Math.max(0, S.wh.fine - 40); S.skipDivYear = 1610; S.divHist.push(30); S.discontent += 10; S.stats.divYears++; log(S, 'First dividend paid in kind: mace worth 75% of capital.', 'money'); return 'Shareholders receive sacks of mace. Many are not pleased.'; } },
      { label: 'Pay in cash at the May meeting', hint: 'Set the rate yourself on the Shareholders panel.', fx: () => 'You will set the rate at the May meeting.' },
    ],
    history: 'The first VOC dividend, in 1610, was paid in mace worth 75% of capital. The payouts of 1610–12 totalled 162.5%, mostly in spices, and many shareholders objected to being paid in kind.',
  },
  {
    id: 'brouwer', at: [1611, 8, 1],
    title: 'A faster road to Java',
    body: () => `<p>Commander Hendrik Brouwer reports a new route. From the Cape, instead of hugging Africa and crossing the monsoon seas, he ran east on the strong westerlies of the far south, then turned north to Java. He saved months.</p>`,
    choices: [{ label: 'Order all captains to take the southern route', fx: S => { S.flags.brouwer = true; return 'Outbound voyages are now much shorter.'; } }],
    history: 'The Brouwer route became compulsory for Company ships in 1616. It cut the Cape–Java passage dramatically, though ships that turned north too late were wrecked on the Australian coast.',
  },
  {
    id: 'batavia', at: [1619, 5, 30],
    title: 'Batavia',
    onTrigger: S => { S.flags.batavia = true; },
    body: () => `<p>Governor-General Jan Pieterszoon Coen has destroyed the town of Jayakarta on Java and founded <b>Batavia</b> on its ruins. It will be the Company's headquarters in Asia, where every cargo is gathered, accounted for and reloaded.</p>
      <blockquote>“We cannot carry on trade without war, nor war without trade.”<cite>Coen to the Heeren XVII, 1614</cite></blockquote>`,
    choices: [{ label: 'Continue' }],
    history: 'Batavia remained the hub of the Company for 180 years. Coen often acted first and asked Amsterdam later; letters took the better part of a year each way.',
  },
  {
    id: 'banda', at: [1620, 11, 1],
    title: 'Coen asks for a free hand in Banda',
    body: () => `<p>The Banda Islands are the only place on earth where nutmeg and mace grow. The Bandanese sell to whoever pays, including the English, despite contracts the Company forced on them.</p>
      <p>Coen writes asking for authority to subjugate the islands and take the nutmeg trees for the Company. Under the 1619 accord the English are supposed to share the spice trade.</p>`,
    choices: [
      { label: 'Authorise the conquest', hint: 'Secures the nutmeg and mace monopoly. Banda needs a garrison of 600 for good.', fx: S => { conquerBanda(S); return 'Your consent sails east.'; } },
      { label: 'Order him to keep the accord with the English', hint: 'Shared trade, lower margins.', fx: S => {
        if (Math.random() < 0.35) { conquerBanda(S); return 'Your letter arrives too late. Coen has already sailed for Banda.'; }
        S.flags.banda = 'contract'; return 'Coen grudgingly holds back. The English stay in the islands, and nutmeg stays expensive to buy.'; } },
    ],
    history: 'The Heeren XVII backed Coen. In 1621 his forces conquered the Banda Islands. Of an estimated 15,000 Bandanese, about 1,000 remained on the islands; the rest were killed, starved, enslaved, deported or fled. The nutmeg groves were divided among Dutch planters (perkeniers), worked by enslaved people brought from elsewhere. Some historians call it genocide.',
  },
  {
    id: 'revolt', at: [1622, 11, 1],
    title: 'The shareholders revolt',
    body: S => `<p>Pamphlets are circulating on the Dam. Investors holding a large share of the capital accuse the directors of self-dealing, of hiding the accounts and of spending on war instead of paying dividends. The charter is up for renewal in 1623.</p><p>Shareholder discontent: <b>${Math.round(S.discontent)}/100</b>.</p>`,
    choices: [
      { label: 'Accept a supervisory committee of large shareholders', fx: S => { S.flags.heren9 = true; S.discontent = Math.max(0, S.discontent - 40); return 'A committee of nine will look over your shoulder.'; } },
      { label: 'Refuse, and rely on the States General', fx: S => { S.discontent = Math.max(0, S.discontent - 10); S.sent -= 0.1; return 'The States back the board. The pamphlets get angrier.'; } },
    ],
    history: 'The 1623 charter created a nine-member committee of large shareholders to oversee the directors and let them nominate new ones. Ordinary shareholders still had no vote, and the accounts stayed closed.',
  },
  {
    id: 'amboyna', at: [1623, 3, 9],
    title: 'Amboyna',
    onTrigger: S => { S.flags.eicIndia = true; S.flags.amboyna = true; addOther(S, 'Ambon, 1623', 'About twenty men, ten of them English, executed after torture on charges of plotting against the Company fort.'); },
    body: () => `<p>On Ambon the Company's governor has had about twenty men, ten of them English, tortured and executed, accused of plotting to seize the fort. The English East India Company is pulling out of the Spice Islands.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'The “Amboyna massacre” became English propaganda for decades. Pushed out of the spice trade, the English East India Company concentrated on India: cotton cloth and, later, tea — the growth markets of the next century. In this game, that is why English competition in cloth and tea is stronger than it would otherwise be.',
  },
  {
    id: 'hongi', at: [1652, 3, 1], cond: S => !!S.asia.posts.ambon,
    title: 'Cloves grow everywhere',
    body: () => `<p>The Company holds the clove fort on Ambon, but clove trees grow on dozens of islands in the Moluccas. Local rulers sell to Makassar traders, who sell on to the English, Danes and Portuguese. Clove prices in Amsterdam suffer.</p>
      <p>The Governor of Ambon proposes <i>hongi</i> expeditions: fleets of war canoes, rowed by villagers obliged to serve, that sail the islands each year and cut down every clove tree the Company does not control. Rulers would receive a yearly payment for the lost trees.</p>`,
    choices: [
      { label: 'Authorise the hongi expeditions', hint: 'Half of the clove smuggling stops. A step toward the clove monopoly.', fx: S => { S.flags.hongi = true; S.asia.capital -= 200000; addOther(S, 'Moluccas, 1650s', 'Hongi fleets cut down clove trees outside Company control. Villages that resisted lost their clove trees and food gardens; after the long war over West Seram, survivors were deported in 1655.'); return 'The first hongi fleet sails from Ambon.'; } },
      { label: 'Buy cloves where they grow, at market prices', hint: 'Cheaper in lives and garrisons. Cloves keep leaking to rivals.', fx: () => 'Clove trees keep growing outside Company control.' },
    ],
    history: 'The Company did enforce its clove monopoly by extirpatie, the systematic destruction of clove trees outside Ambon and a few controlled islands, using annual hongi expeditions. The policy lasted into the 19th century.',
  },
  {
    id: 'makassar', at: [1666, 11, 1],
    title: 'Makassar, the free port',
    body: () => `<p>The sultanate of Gowa at Makassar on Sulawesi runs an open port. Spices the Company cannot control pass through it to every buyer in Asia and Europe.</p>
      <p>Admiral Cornelis Speelman offers to take a fleet there. Arung Palakka, a Bugis prince in exile and enemy of Gowa, will join him with his own army.</p>`,
    choices: [
      { label: 'Send Speelman and ally with Arung Palakka', hint: 'Costs Batavia ƒ600k. Closes the last free spice port.', fx: S => { S.flags.makassar = true; S.asia.capital -= 600000; addOther(S, 'Makassar, 1666–69', 'War against the sultanate of Gowa, fought together with Arung Palakka\'s Bugis forces. Makassar was taken and ceased to be a free port for spices.'); return 'Speelman sails for Makassar.'; } },
      { label: 'Leave Makassar alone', hint: 'Spices keep leaking through Makassar.', fx: () => 'Makassar stays open.' },
    ],
    history: 'Speelman and Arung Palakka forced Gowa to sign the Treaty of Bongaya in 1667; fighting went on until 1669. The Company\'s victory depended on its Asian allies, and Arung Palakka became the dominant power in southern Sulawesi.',
  },
  {
    id: 'bantam1682', at: [1682, 4, 1], cond: S => !!S.asia.posts.bantam,
    title: 'Civil war in Bantam',
    body: () => `<p>In the sultanate of Bantam, the young sultan Haji has risen against his father, Sultan Ageng. Haji asks the Company for help. In return he offers to expel the English and other Europeans from Bantam and give the Company the pepper trade.</p>`,
    choices: [
      { label: 'Intervene for Sultan Haji', hint: 'Costs Batavia ƒ300k. English pepper supply falls.', fx: S => { S.flags.bantamWar = true; S.asia.capital -= 300000; return 'Company troops land at Bantam.'; } },
      { label: 'Stay out of it', fx: () => 'The English keep their factory at Bantam.' },
    ],
    history: 'The Company backed Haji, and in 1682 the English were expelled from Bantam. They moved to Bencoolen on Sumatra and kept buying pepper there and in Malabar. The VOC never controlled the whole pepper trade.',
  },
  {
    id: 'kermis', at: [1636, 1, 10],
    title: 'A third sailing season',
    onTrigger: S => { S.flags.kermis = true; },
    body: () => `<p>Besides the Christmas and Easter departures, the Heeren XVII add a <b>Kermis fleet</b>, sailing in September and October.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'The fleets were departure windows rather than convoys: the 14 ships of the 1663 Easter fleet left over seven weeks.',
  },
  {
    id: 'dejima', at: [1641, 6, 1], cond: S => !!S.asia.posts.japan,
    title: 'Dejima',
    body: () => `<p>The Tokugawa shogunate has expelled the Portuguese and moved the Company's post from Hirado to <b>Dejima</b>, a small artificial island in Nagasaki harbour. The Dutch are now the only Europeans allowed to trade with Japan.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'For two centuries Dejima was Japan\'s main window on Europe. Japanese silver, and later copper, financed the Company\'s purchases of Indian cloth.',
  },
  {
    id: 'cape', at: [1652, 4, 6],
    title: 'A station at the Cape',
    onTrigger: S => { S.asia.posts.cape = { since: S.t }; },
    body: () => `<p>Jan van Riebeeck has landed at Table Bay to build a fort and gardens. Ships can now stop for fresh water, meat and vegetables halfway to Asia.</p><p>Voyages get about a month longer, but fewer men die of scurvy on the way.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'The Cape station grew into a colony that took land from the Khoikhoi and relied on enslaved labour: from none in 1652 to 16,839 enslaved people in 1795.',
  },
  {
    id: 'formosa', at: [1662, 2, 1], cond: S => !!S.asia.posts.formosa,
    title: 'Formosa is lost',
    onTrigger: S => { delete S.asia.posts.formosa; S.flags.lost = { ...(S.flags.lost || {}), formosa: true }; S.sent -= 0.08; },
    body: () => `<p>After a nine-month siege, Fort Zeelandia has surrendered to the Ming loyalist commander Zheng Chenggong (Koxinga). The Company has lost Formosa.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'Zheng Chenggong\'s army of some 25,000 men overwhelmed the small Dutch garrison. It was one of the Company\'s few outright defeats by an Asian power.',
  },
  {
    id: 'silverban', at: [1668, 3, 1], cond: S => !!S.asia.posts.japan,
    title: 'Japan stops the silver',
    body: () => `<p>The shogunate has banned the export of silver. From now on the Company can take copper and gold coins out of Japan, worth far less to Batavia.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'Japanese silver had paid for Indian textiles, which in turn bought spices in the islands. Losing it meant more silver had to be shipped all the way from Europe.',
  },
  {
    id: 'rampjaar', at: [1672, 6, 15],
    title: 'The Disaster Year',
    onTrigger: S => { S.sent -= 0.35; },
    body: () => `<p>France, England and two German bishoprics have attacked the Republic at once. French armies are deep inside the country; the dikes are being opened to flood the land in front of Amsterdam. VOC shares are collapsing.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'The Republic survived the Rampjaar of 1672, but it marked the end of its unchallenged prime. VOC shares recovered and reached new heights in the decades that followed.',
  },
  {
    id: 'coffee', at: [1707, 2, 1],
    title: 'Coffee on Java',
    body: () => `<p>Europe is acquiring a taste for coffee. Until now the Company has bought it at Mocha in Yemen. Seedlings planted on Java are doing well in the Priangan highlands.</p><p>The local regents could be ordered to have their villages grow coffee and deliver it at a price the Company sets.</p>`,
    choices: [
      { label: 'Order forced deliveries on Java', hint: 'Cheap, large supply from about 1711.', fx: S => { S.asia.posts.priangan = { since: S.t }; addOther(S, 'Priangan, Java', 'From the early 1700s regents and villagers were obliged to grow coffee and deliver it at prices set by the Company.'); return 'Instructions sail for Batavia.'; } },
      { label: 'Keep buying at Mocha', hint: 'Small, expensive supply. You can order a Mocha post.', fx: () => 'Coffee will stay a small trade for you.' },
    ],
    history: 'The Company did set up forced coffee deliveries on Java through local regents. By the 1720s Java coffee was flooding Europe, and its price fell for most of the century.',
  },
  {
    id: 'bubble', at: [1720, 3, 1],
    title: 'The bubble year',
    onTrigger: S => { S.sent += 0.45; },
    body: () => `<p>Paris has gone mad for Mississippi shares, London for the South Sea Company. Money is pouring into anything that trades on an exchange. VOC shares are soaring.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'VOC shares reached their highest prices in the 1720s, around six times face value, just as the Company\'s real profits were shrinking. The market priced the dividend, not the business.',
  },
  {
    id: 'canton', at: [1729, 1, 15],
    title: 'Tea from Canton',
    body: () => `<p>Tea used to reach Batavia on Chinese junks. The Heeren XVII now allow ships to sail directly to <b>Canton</b> to buy it. You can order a post there in your letter to Batavia.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'Tea became the great growth trade of the 18th century. The English company dominated it, buying tea with Indian cloth and, later, opium rather than silver.',
  },
  {
    id: 'malaria', at: [1733, 6, 1],
    title: 'Fever in Batavia',
    body: () => `<p>Reports describe a new and deadly fever in Batavia. Newly arrived soldiers and sailors are dying within months of landing.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'From 1733 malaria, bred in fish ponds and silted canals around the city, made Batavia known as “the graveyard of the East”. Deaths among Company employees rose sharply and stayed high.',
  },
  {
    id: 'geger', at: [1741, 7, 1],
    title: 'News from Batavia',
    onTrigger: S => { S.flags.disrupt1740 = true; S.asia.capital -= 300000; S.sent -= 0.08; addOther(S, 'Batavia, October 1740', 'Between 5,000 and 10,000 Chinese residents killed by soldiers and townspeople after unrest in the sugar districts around the city.'); },
    body: S => `<p>Last October, after Chinese sugar workers outside Batavia rose against deportation threats, Company soldiers and townspeople turned on the Chinese inside the city. For days they killed. Estimates run from 5,000 to more than 10,000 dead. The sugar districts are in ruins.</p>
      <p>Governor-General Adriaan Valckenier and his council member Van Imhoff blame each other.</p>${S.flags.sugar ? '<p>The sugar mills you encouraged around Batavia are burned or abandoned.</p>' : ''}`,
    choices: [
      { label: 'Recall Valckenier and order an inquiry', fx: () => 'An order to arrest Valckenier sails east.' },
      { label: 'Take no action', fx: S => { S.sent -= 0.04; return 'The matter is left to Batavia.'; } },
    ],
    history: 'Valckenier was arrested and died in a Batavia prison in 1751 before his trial ended. Van Imhoff became Governor-General. The massacre is remembered in Indonesia as Geger Pacinan.',
  },
  {
    id: 'war4', at: [1780, 12, 20],
    title: 'War with Britain',
    onTrigger: S => {
      S.flags.war4 = true; S.sent -= 0.4; let n = 0;
      for (const sh of S.ships) {
        if ((sh.state === 'out' && !sh.lost) || (sh.state === 'home' && !sh.lostH)) {
          if (Math.random() < 0.4) { if (sh.state === 'out') sh.lost = true; else sh.lostH = true; n++; }
        }
      }
    },
    body: () => `<p>Britain has declared war on the Republic. The Royal Navy is hunting Company ships at sea, and British forces are attacking posts in India and the Indian Ocean.</p><p>Return fleets will be stuck in Batavia for at least two seasons.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'The Fourth Anglo-Dutch War (1780–84) cost the Company an estimated ƒ43 million and about half its fleet. From 1784 the States had to lend it tens of millions to keep it afloat.',
  },
  {
    id: 'stateaid', at: [1784, 6, 1],
    title: 'The State steps in',
    onTrigger: S => { S.cash += 5e6; S.debt += 5e6; S.books.borrowed += 5e6; },
    body: () => `<p>Peace has been signed, but the Company cannot meet its obligations. The States of Holland agree to guarantee new loans. <b>ƒ5 million</b> is added to your treasury, and to your debt.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'Between 1784 and 1790 the state provided some ƒ58 million in support. The Company kept paying dividends for several more years.',
  },
  {
    id: 'batavian', at: [1795, 1, 19],
    title: 'Revolution',
    onTrigger: S => { delete S.asia.posts.cape; delete S.asia.posts.ceylon; S.flags.lost = { ...(S.flags.lost || {}), cape: true, ceylon: true }; S.sent -= 0.2; },
    body: () => `<p>French revolutionary armies have crossed the frozen rivers. The Stadholder has fled to England, and the Batavian Republic is proclaimed. In exile he orders Dutch colonies to accept British protection. The Cape and Ceylon will fall to Britain.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'Britain took the Cape in 1795 and Ceylon in 1796. The new republic had little patience with a bankrupt company run by the old regents.',
  },
  {
    id: 'nationalised', at: [1796, 3, 1],
    title: 'The board is dismissed',
    onTrigger: S => { S.flags.nationalised = true; S.auto.n = 0; },
    body: () => `<p>The Heeren XVII have been dismissed. A <i>Committee for the Affairs of the East Indian Trade</i> now runs the Company for the state. You stay on as an adviser, but you can no longer equip ships.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'The charter was allowed to lapse at the end of 1799. On 1 January 1800 the Batavian state took over the Company\'s possessions and its debts.',
  },
  // ---------- events driven by the state of your company ----------
  {
    id: 'deathship', check: S => !!S.news.disaster && !S.flags.provisions, cooldown: 12, max: 3,
    onTrigger: S => { S.news.cur = S.news.disaster; S.news.disaster = null; },
    title: 'A death ship',
    body: S => `<p>The latest letter from Batavia reports that the <i>${esc(S.news.cur.name)}</i> arrived with ${num(S.news.cur.deaths)} of her ${CREW} men dead on the way. Scurvy, fever and dysentery. The survivors were carried ashore.</p><p>The surgeons' guild proposes better provisions: more fresh water casks, preserved vegetables, more cooks and medicine chests.</p>`,
    choices: [
      { label: 'Pay for better provisions', hint: '+ƒ10k per ship. About a fifth fewer deaths at sea.', fx: S => { S.flags.provisions = true; return 'From the next fleet, every ship carries better stores.'; } },
      { label: 'Accept the losses', hint: 'Men are cheaper than stores.', fx: () => 'Nothing changes.' },
    ],
    history: 'On average, something like one in five men died on the outward voyage in the 18th century, and single voyages could lose more than half. Remedies such as citrus were known to some surgeons but were not used consistently. The Cape station did most to bring deaths down.',
  },
  {
    id: 'mutiny', check: S => !!S.news.mutiny, cooldown: 25, max: 3,
    onTrigger: S => { S.news.cur = S.news.mutiny; S.news.mutiny = null; },
    title: 'Mutiny',
    body: S => `<p>Word comes from the Cape: the <i>${esc(S.news.cur.name)}</i> will never reach Batavia. Her crew, hungry, sick and unpaid for months, rose against the officers. Some say they meant to turn pirate. The ship, her silver and her men are lost to the Company.</p>`,
    choices: [
      { label: 'Raise sailors’ pay', hint: '+ƒ5k per ship. Mutinies become rarer.', fx: S => { S.flags.sailorPay = true; return 'Wages for ordinary sailors go up.'; } },
      { label: 'Harsher discipline', hint: 'Keelhauling and the noose. Costs nothing.', fx: () => 'The articles of war are read aloud before every voyage.' },
    ],
    history: 'Mutinies on Company ships were rare but deeply feared. Punishments were brutal: flogging, keelhauling, and hanging for ringleaders. The most notorious case was the Batavia in 1629.',
  },
  {
    id: 'silverplea', check: S => S.reportNew && S.report && S.report.capital < 150000, cooldown: 15, max: 4, from: 1612,
    title: 'Batavia begs for silver',
    body: S => `<p>The Governor-General writes that Batavia had only <b>${money(S.report.capital)}</b> left. He cannot pay the garrisons, and the cloth merchants of Coromandel will not sell on credit. Without silver, he warns, the posts will produce nothing and the ships will come home half empty.</p>`,
    choices: [
      { label: 'Equip an emergency silver ship', hint: `A ship with the most silver allowed, ready for the next sailing. Borrowed if need be.`, show: S => !S.flags.nationalised, fx: S => { if (!equipShip(S, maxSilver(yearOf(S.t)), true)) return 'The committee equips the ships now. No emergency ship can be sent.'; return 'A ship is loaded with silver at Texel.'; } },
      { label: 'Let Batavia borrow from Chinese merchants', hint: 'ƒ1M in Batavia now; ƒ80k a year in interest for 15 years.', fx: S => { S.asia.capital += 1e6; S.asia.loanUntil = yearOf(S.t) + 15; return 'Batavia may borrow locally.'; } },
      { label: 'Order him to economise', hint: 'Upkeep −15% for five years, but posts produce 15% less.', fx: S => { S.asia.economyUntil = yearOf(S.t) + 5; return 'Orders to economise sail east.'; } },
    ],
    history: 'Europe produced little that Asia wanted to buy, so the Company had to ship silver east year after year. Batavia was chronically short of cash and often borrowed from Chinese and other Asian merchants in the city.',
  },
  {
    id: 'idlesilver', check: S => S.reportNew && S.report && S.report.capital > (1.5e6 + 0.25e6 * S.report.posts.length) * 1.6, cooldown: 15, max: 3,
    title: 'Silver piling up in Batavia',
    body: S => `<p>Batavia's books show <b>${money(S.report.capital)}</b> in cash, far more than its trade can use. Idle silver does not stay idle for long: some of it finds its way into the pockets of Company servants.</p>`,
    choices: [
      { label: 'Ship the surplus home as gold and diamonds', hint: 'About half its value reaches Amsterdam after losses and discounts.', fx: S => { const ex = Math.max(0, S.asia.capital - workingCap(S)); S.asia.capital -= ex * 0.8; S.cash += ex * 0.45; S.books.other -= ex * 0.45; log(S, `${money(ex * 0.45)} in gold and gems from Batavia added to the treasury.`, 'money'); return `${money(ex * 0.45)} reaches the treasury.`; } },
      { label: 'Leave it in Batavia', hint: 'Send less silver per ship instead.', fx: () => 'The silver stays in Asia.' },
    ],
    history: 'Most of the Company’s capital in Asia stayed there, financing trade between Asian ports. Only a small share ever flowed back to the Netherlands as cash; the return came as cargo.',
  },
  {
    id: 'corruption', check: S => S.reportNew && S.report && S.report.leak >= 0.18, cooldown: 20, max: 3,
    title: 'Fortunes in Batavia',
    body: S => `<p>Company servants on modest salaries are returning from Asia rich. The fiscal in Batavia estimates that about <b>${Math.round(S.report.leak * 100)}%</b> of what the Company spends in Asia is lost to private trade, smuggling and false accounts.</p>`,
    choices: [
      { label: 'Send a commissioner-general to investigate', hint: 'ƒ150k. Losses fall by 40% for ten years.', fx: S => { payOther(S, 150000); S.asia.commissionUntil = yearOf(S.t) + 10; return 'A commissioner sails with full powers.'; } },
      { label: 'Let servants trade privately, as the English do', hint: 'Losses halve for good, but more spices are smuggled to rivals.', fx: S => { S.flags.privateTrade = true; return 'Private trade is allowed, within limits.'; } },
      { label: 'Ignore it', fx: () => 'Nothing is done.' },
    ],
    history: 'Contemporaries joked that VOC stood for Vergaan Onder Corruptie, “perished by corruption”. Historians now see the problem as built into the Company: low pay, and a ban on private trade that everyone broke. The English company let its servants trade on their own account.',
  },
  {
    id: 'glut', check: S => S.wh.fine > market(S, 'fine', yearOf(S.t)).d / 2 * 1.5, cooldown: 20, max: 3,
    title: 'Too much nutmeg',
    body: S => `<p>The warehouses hold <b>${num(S.wh.fine)} t</b> of fine spices, far more than Europe will buy at a good price. The buyers know it, and bids are falling.</p>`,
    choices: [
      { label: 'Burn half of it', hint: 'Prices recover. The smoke smells of nutmeg for days.', fx: S => { const q = S.wh.fine * 0.5; S.wh.fine -= q; log(S, `${num(q)} t of spices burned to hold up the price.`, 'loss'); return `${num(q)} t go up in smoke.`; } },
      { label: 'Sell half cheaply in the Baltic and the Levant', hint: 'Cash now, at about a third of the usual price.', fx: S => { const q = S.wh.fine * 0.5, p = (S.lastPrice.fine || 4000) * 0.35; S.wh.fine -= q; S.cash += q * p; S.books.sales.fine += q * p; return `${money(q * p)} raised.`; } },
      { label: 'Keep it', fx: () => 'The spices stay in store.' },
    ],
    history: 'Contemporaries described large quantities of spices being burned in Amsterdam and Middelburg to keep prices up. Limiting supply was the point of the monopoly.',
  },
  {
    id: 'convoys', check: S => !S.flags.convoys && S.news.losses.filter(t => t > S.t - 730).length >= 3, cooldown: 15,
    title: 'Three ships in two years',
    body: () => `<p>Three Company ships have been lost in two years. The chamber of Zeeland proposes that ships sail in convoys, with armed escorts through the dangerous waters off Africa and in the Channel.</p>`,
    choices: [
      { label: 'Sail in convoys', hint: 'Ships cost 15% more. Losses at sea halve.', fx: S => { S.flags.convoys = true; return 'Convoys from the next season.'; } },
      { label: 'Accept the risk', fx: () => 'Ships keep sailing alone.' },
    ],
    history: 'Return fleets usually sailed together, and in wartime the Republic’s navy escorted them home around Scotland. About 4–5% of homeward voyages were lost.',
  },
  {
    id: 'garrison', check: S => S.reportNew && S.report && S.report.need > 0 && S.report.personnel < S.report.need * 0.7, cooldown: 15, max: 4, from: 1615,
    title: 'Empty barracks',
    body: S => `<p>Batavia reports <b>${num(S.report.personnel)}</b> men in service for <b>${num(S.report.need)}</b> places. Forts are half manned; posts cannot be worked. Fever kills recruits faster than ships bring them.</p>`,
    choices: [
      { label: 'Recruit Asian soldiers', hint: 'Fills 40% of the gap now. +ƒ60k a year.', fx: S => { S.asia.personnel += S.report.need * 0.4; S.flags.asianTroops = true; return 'Ambonese, Balinese and Bugis companies are raised.'; } },
      { label: 'Pay crimps to find more men in Germany', hint: 'Each ship leaves 40 more soldiers in Asia.', fx: S => { S.flags.crimps = true; addOther(S, 'Recruitment, Amsterdam', 'Crimps (zielverkopers) lodged poor recruits, many from the German lands, and took a share of their future wages. More men sailed east, and more died there.'); return 'The crimps of Amsterdam get busy.'; } },
      { label: 'Give up the costliest post', hint: 'Less upkeep, fewer men needed.', fx: S => { const ids = Object.keys(S.asia.posts).filter(id => POSTS[id].how === 'letter'); if (!ids.length) return 'There is no post you can give up.'; const id = ids.sort((a, b) => postUpkeep(S, b) - postUpkeep(S, a))[0]; delete S.asia.posts[id]; act(S, `${POSTS[id].name} abandoned on orders from Amsterdam.`); return `${POSTS[id].name} will be abandoned.`; } },
    ],
    history: 'Most of the Company’s soldiers were not Dutch: by 1790 about 70% were foreign-born, mostly German. In Asia it relied heavily on Asian troops and allies, without whom wars like Makassar could not have been won.',
  },
  {
    id: 'opium', check: S => !!(S.report && S.report.posts.includes('bengal')), once: true, from: 1677,
    title: 'Opium from Bengal',
    body: () => `<p>The Bengal post reports that opium grown around Patna sells for many times its price in Java and the islands, where it is smoked mixed with tobacco. Company ships could carry it to Batavia and sell it under monopoly.</p>`,
    choices: [
      { label: 'Ship Bengal opium to Java', hint: 'About ƒ150k a year for Batavia.', fx: S => { S.flags.opium = true; addOther(S, 'Java, from the 1670s', 'Bengal opium shipped to Java and sold under Company monopoly. From 1745 an Opium Society (Amfioen Sociëteit) ran the trade.'); return 'The first chests of opium are loaded at Hugli.'; } },
      { label: 'Refuse', fx: () => 'The Company leaves opium to others.' },
    ],
    history: 'The VOC traded Bengal opium to Java from the 1670s. In 1745 it set up the Amfioen Sociëteit to monopolise sales. The English company later built an even larger opium trade to China.',
  },
  {
    id: 'sugar', check: S => !!S.asia.posts.bantam && yearOf(S.t) < 1735, once: true, from: 1690,
    title: 'Sugar around Batavia',
    body: () => `<p>Chinese entrepreneurs are clearing the land around Batavia, the Ommelanden, for sugar cane and mills. They bring in thousands of workers from Fujian. The mills pay rent and taxes, and Batavia gains a sugar export.</p>`,
    choices: [
      { label: 'Encourage the mills', hint: 'About ƒ60k a year for Batavia.', fx: S => { S.flags.sugar = true; return 'More land is leased to the mill owners.'; } },
      { label: 'Keep the Ommelanden small', fx: () => 'The mills stay few.' },
    ],
    history: 'Sugar mills spread around Batavia from the 1680s. When prices collapsed in the 1720s and 30s, many closed and their workers were left without income. The Company’s plan to deport “unemployed” Chinese to Ceylon helped set off the uprising and massacre of 1740.',
  },
  {
    id: 'capeslaves', check: S => !!S.asia.posts.cape, once: true, from: 1655,
    title: 'Labour for the Cape',
    body: () => `<p>The Cape station needs hands for its gardens, fields and fort. The Khoikhoi will not work for the Company on its terms, and few Dutch settlers come.</p><p>The commander asks to send Company ships to buy enslaved people in Madagascar and on the African coast.</p>`,
    choices: [
      { label: 'Approve the slave voyages', hint: 'Cape upkeep −ƒ20k a year.', fx: S => { S.flags.capeSlaves = true; addOther(S, 'Cape Colony', 'Enslaved people brought from Madagascar, Mozambique, India and the Indonesian islands. There were 16,839 by 1795, more than the free settlers.'); return 'Company ships sail for Madagascar.'; } },
      { label: 'Rely on settlers and paid labour', hint: 'Costlier, slower.', fx: () => 'The Cape stays small.' },
    ],
    history: 'The Company did organise slaving voyages to Madagascar and elsewhere for the Cape. Enslaved people grew from none in 1652 to 16,839 in 1795, while the Khoikhoi lost their land and cattle to the expanding colony.',
  },
  // ---------- more dated events ----------
  {
    id: 'mataram', at: [1628, 9, 1],
    title: 'Batavia besieged',
    onTrigger: S => { S.asia.capital -= 150000; },
    body: () => `<p>Sultan Agung of Mataram, the strongest power on Java, has sent a great army against Batavia. The town is under siege, and Batavia's money goes to soldiers and walls instead of cargo.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'Mataram besieged Batavia in 1628 and again in 1629. The second attack failed after the Dutch burned the rice stores that fed Agung’s army. Coen died in the town during the second siege.',
  },
  {
    id: 'batavia1629', at: [1630, 6, 1],
    title: 'The wreck of the Batavia',
    body: () => `<p>News arrives of the Company's newest ship, the <i>Batavia</i>. On her maiden voyage she ran onto a reef off the unknown South Land. While her commander went for help, a junior merchant, Jeronimus Cornelisz, took control of the survivors and had more than a hundred of them murdered.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'The Batavia was wrecked on the Houtman Abrolhos in June 1629. Commander Pelsaert reached Batavia in a longboat and returned with a rescue ship; Cornelisz and other mutineers were executed. Ships following the Brouwer route too far east kept hitting the Australian coast.',
  },
  {
    id: 'tasman', at: [1642, 7, 1],
    title: 'The South Land',
    body: () => `<p>Governor-General Antonio van Diemen proposes an expedition under Abel Tasman to explore the great unknown land south of the Indies. Perhaps there is gold, or a new route to Chile.</p>`,
    choices: [
      { label: 'Fund the expedition', hint: 'ƒ100k from Batavia.', fx: S => { S.asia.capital -= 100000; S.flags.tasman = true; return 'Tasman sails from Batavia in August.'; } },
      { label: 'Not worth the money', fx: () => 'The South Land stays unexplored, for now.' },
    ],
    history: 'Tasman reached Tasmania (which he named Van Diemen’s Land), New Zealand, Tonga and Fiji in 1642–43. He found nothing to trade, and the Company lost interest in exploration.',
  },
  {
    id: 'credit1773', at: [1773, 1, 15],
    title: 'Credit crisis in Amsterdam',
    onTrigger: S => { S.flags.credit1773 = true; S.sent -= 0.12; },
    body: () => `<p>The Amsterdam banking house Clifford & Co. has collapsed, and others are following. Lenders are calling in their money. The Company will pay more for every guilder it borrows for the next few years.</p>`,
    choices: [{ label: 'Continue' }],
    history: 'The failure of Clifford & Co. in December 1772 set off a financial crisis across northern Europe. For a company already living on borrowed money, dearer credit was dangerous. In the game, interest rises to 5.5% until 1778.',
  },
  {
    id: 'pamphlets', at: [9999, 1, 1],
    title: 'Pamphlets on the Dam',
    body: S => `<p>Shareholders are furious about the dividend. Anonymous pamphlets accuse the board of incompetence and worse.</p><p>Shareholders expect about <b>${Math.round(expectation(S))}%</b>. Discontent: <b>${Math.round(S.discontent)}/100</b>.</p>`,
    choices: [
      { label: 'Promise to meet expectations next May', fx: S => { S.divRate = Math.max(S.divRate, Math.round(expectation(S))); S.discontent -= 25; return `Dividend set to ${S.divRate}%.`; } },
      { label: 'Ignore them', fx: S => { S.sent -= 0.15; return 'The share price falls.'; } },
    ],
    history: 'Dividends were the Company\'s political licence. From 1730 they exceeded earnings in almost every decade, paid first from capital in Asia and then from short-term loans in Amsterdam.',
  },
];
const EVENT_BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e]));
// Choices a player can see now (a choice may carry show(S)). Index i stays the index into e.choices.
function visibleChoices(S, e) { return e.choices.map((c, i) => ({ c, i })).filter(({ c }) => !c.show || c.show(S)); }
// Resolve the event at the head of the queue. The UI only peeks at S.queue[0] while the card is open,
// so a save taken meanwhile still holds the event; it leaves the queue only here, when the player answers.
function resolveEvent(S, id, i) {
  const k = S.queue.indexOf(id); if (k >= 0) S.queue.splice(k, 1);
  const e = EVENT_BY_ID[id], c = e && e.choices[i];
  return c && c.fx ? (c.fx(S) || '') : '';
}

function conquerBanda(S) {
  S.flags.banda = 'conquest';
  addOther(S, 'Banda Islands, 1621', 'Population about 15,000 before the conquest, about 1,000 after. Thousands were killed; many more died of hunger and disease, were enslaved and deported, or fled.');
}
