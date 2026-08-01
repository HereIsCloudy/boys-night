// ═══════════════════════════════════════════════════════════════════════════
// RILEY CARD COLLECTION — pure data, no imports (safe for state.js to import)
//
// BALANCE BUDGET — totals if a player owns ALL 105 cards + every set bonus:
//   all_multi        ~23%   (biggest lever, earned only at 100% completion)
//   slot_win_mult    ~9%    crash_multi   ~15%   coinflip_mult ~11%
//   jackpot_rate     ~1.9%  coinflip_ins  ~5%    dice_reroll   ~8%
//   return_on_loss   ~4.5%  passive_income ~72%  bet_bonus     ~23 coins
//   xp_gain ~24%  pull_discount ~2.3%  pity_speed ~7.5%  chaos_wild ~4%
//   wheel_jackpot +1 segment, wheel_void_remove +1
// Individual cards are intentionally tiny — the fantasy is the COLLECTION.
// ═══════════════════════════════════════════════════════════════════════════

export const CARD_RARITIES = {
  common:    { label: 'COMMON',    color: '#9ca3af', weight: 55,   dust: 25 },
  rare:      { label: 'RARE',      color: '#00d9f5', weight: 27,   dust: 60 },
  epic:      { label: 'EPIC',      color: '#b347ff', weight: 12,   dust: 150 },
  legendary: { label: 'LEGENDARY', color: '#fbbf24', weight: 4.5,  dust: 400 },
  mythic:    { label: 'MYTHIC',    color: '#ff3fa4', weight: 1.2,  dust: 1000 },
  riley:     { label: '★ RILEY ★', color: '#ff2d55', weight: 0.3,  dust: 2500 },
};
export const CARD_RARITY_ORDER = ['common','rare','epic','legendary','mythic','riley'];

export const BOOST_LABELS = {
  all_multi:        v => `+${v}% to ALL win multipliers`,
  slot_win_mult:    v => `+${v}% slot win multipliers`,
  slot_jackpot_rate:v => `+${v}% slot jackpot chance`,
  crash_multi:      v => `+${v}% crash cashout multiplier`,
  coinflip_mult:    v => `+${v}% streak multipliers`,
  coinflip_ins:     v => `+${v}% streak loss protection`,
  dice_reroll_ones: v => `+${v}% chance to reroll 1s`,
  jackpot_rate:     v => `+${v}% jackpot rate (all games)`,
  return_on_loss:   v => `Recover +${v}% of losses`,
  xp_gain:          v => `+${v}% XP gain`,
  passive_income:   v => `+${v}% passive income`,
  bet_bonus:        v => `+${v} free coins on every bet`,
  pull_discount:    v => `-${v}% shop pull costs`,
  pity_speed:       v => `Pity fills +${v}% faster`,
  chaos_wild:       v => `+${v}% chaos bonus chance`,
  wheel_jackpot:    v => `+${v} JACKPOT wheel segment`,
  wheel_void_remove:v => `-${v} VOID wheel segment`,
};

// helper for terse card defs
const C = (id, rarity, name, text, key, v) => ({ id, rarity, name, text, boost: { key, v } });

export const CARDS = [
  // ── COMMONS (40) ──────────────────────────────────────────────────────────
  C('c01','common',"Riley Wakes Up","Riley opens one eye. Somewhere, a slot machine flinches.",'xp_gain',1),
  C('c02','common',"Morning Cereal","Riley eats cereal for dinner too. Time is a construct.",'passive_income',2),
  C('c03','common',"Left Sock Riley","He can never find the right one. The left one is loyal.",'bet_bonus',1),
  C('c04','common',"Riley's Water Bottle","Has been refilled zero times this week. Still counts as hydration.",'xp_gain',1),
  C('c05','common',"Homework? Never Heard of It","Riley's backpack has been closed since September.",'passive_income',2),
  C('c06','common',"Riley Blinks","Twice. The odds shift imperceptibly in his favor.",'all_multi',0.2),
  C('c07','common',"The Nap King","Riley can fall asleep in 4 seconds flat. Verified.",'passive_income',3),
  C('c08','common',"Riley's WiFi Password","It's 'password1'. He tells everyone it's encrypted.",'xp_gain',1),
  C('c09','common',"Extra Ketchup","Riley asks for 11 packets. Uses 2. Hoards 9.",'bet_bonus',1),
  C('c10','common',"Riley Laughs at His Own Joke","Nobody else did. He doesn't care. Legend behavior.",'xp_gain',1),
  C('c11','common',"Couch Groove","There is a Riley-shaped dent in the couch. It is load-bearing.",'passive_income',2),
  C('c12','common',"Riley's Lucky Pencil","Never sharpened. Never used. Never lost. Powerful.",'pity_speed',1),
  C('c13','common',"Snack Run","Riley returns with 6 items, none of which were requested.",'bet_bonus',2),
  C('c14','common',"Riley Ignores a Text","Read at 3:47 PM. It's been 9 days. Discipline.",'return_on_loss',0.2),
  C('c15','common',"Two-Minute Shower","Riley emerges somehow completely dry. Science can't explain it.",'xp_gain',1),
  C('c16','common',"Alarm Snoozed ×9","Riley's alarm has given up. It respects him now.",'passive_income',2),
  C('c17','common',"Mismatched Slides","One Nike, one Adidas. Sponsorship neutrality.",'bet_bonus',1),
  C('c18','common',"Riley Says 'Bet'","He says it 40 times a day. Today, it's literal.",'bet_bonus',2),
  C('c19','common',"Chair Lean Master","Two legs. Zero fear. Riley has never fallen. Yet.",'all_multi',0.2),
  C('c20','common',"The Hoodie (Day 6)","Riley's hoodie has achieved sentience. They're friends now.",'passive_income',2),
  C('c21','common',"Phone at 1%","Riley thrives in the danger zone. The 1% lasts 3 hours.",'chaos_wild',0.2),
  C('c22','common',"Riley Forgets Why He Walked In","Stands in the kitchen. Vibes. Leaves with a spoon.",'xp_gain',1),
  C('c23','common',"Group Chat Lurker","Riley has read 4,000 messages. Sent: 'lol'. Once.",'passive_income',2),
  C('c24','common',"Air Guitar Solo","Riley shreds an invisible guitar. The crowd (his mirror) goes wild.",'xp_gain',1),
  C('c25','common',"Cold Pizza Breakfast","Riley insists it's better cold. Riley is correct.",'passive_income',2),
  C('c26','common',"Rock-Paper-Scissors Champ","Riley always throws rock. Everyone knows. He still wins.",'coinflip_ins',0.5),
  C('c27','common',"Shopping Cart Drift","Riley takes the corner at Mach 2. Cereal aisle survivors tell tales.",'dice_reroll_ones',0.5),
  C('c28','common',"Sock Slide Entrance","Riley enters every room like it's a music video.",'slot_win_mult',0.3),
  C('c29','common',"'One More Game' (Lie)","It was 7 more games. It's always 7 more games.",'xp_gain',2),
  C('c30','common',"Riley Pets a Random Dog","The dog now works for Riley. Luck +1.",'pity_speed',1),
  C('c31','common',"Straw Wrapper Trick Shot","Off the wall, off the tray, in the cup. Witnesses: none. Believers: all.",'dice_reroll_ones',0.5),
  C('c32','common',"The Backup Charger","Riley has never charged it. It's the thought that counts.",'return_on_loss',0.3),
  C('c33','common',"Emergency Gum Stash","One piece left. Riley has been saving it for 2 years.",'bet_bonus',1),
  C('c34','common',"Bottle Flip, First Try","The lunchroom erupted. Riley walked away in slow motion.",'coinflip_mult',0.4),
  C('c35','common',"Definitely Doing Homework","Riley's screen has 14 tabs. Zero are homework.",'xp_gain',1),
  C('c36','common',"2 AM Fridge Mission","Full stealth. No lights. Maximum snack extraction.",'passive_income',3),
  C('c37','common',"The Hype Playlist","Riley's pre-game playlist is 90% one song on repeat.",'crash_multi',0.4),
  C('c38','common',"Elbow of Luck","Riley bumps the machine 'by accident'. The machine understands.",'slot_jackpot_rate',0.05),
  C('c39','common',"Riley Calls Heads","He calls heads every time. The coin respects consistency.",'coinflip_ins',0.5),
  C('c40','common',"Participation Trophy","Riley displays it like it's the Champions League. Honestly? Deserved.",'pull_discount',0.3),

  // ── RARES (30) ────────────────────────────────────────────────────────────
  C('r01','rare',"Riley's Poker Face","It's just his normal face. That's what makes it terrifying.",'coinflip_ins',1),
  C('r02','rare',"Double-or-Nothing Riley","Riley has never once chosen 'nothing'. Not once.",'coinflip_mult',1),
  C('r03','rare',"Riley Reads the Room","The room was a crash graph. Riley cashed out at the top.",'crash_multi',1),
  C('r04','rare',"The Lucky Hoodie String","Chewed to perfection. Contains concentrated luck.",'jackpot_rate',0.1),
  C('r05','rare',"Victory Screech","Audible from three blocks away. Scientifically boosts XP.",'xp_gain',2),
  C('r06','rare',"Slot Whisperer","Riley pats the machine twice before spinning. It purrs.",'slot_win_mult',1),
  C('r07','rare',"Riley Does the Math (Wrong)","The answer was 4. Riley said 7. Riley won anyway.",'bet_bonus',3),
  C('r08','rare',"The Confident Strut","Riley walks like the RNG owes him money. It does.",'all_multi',0.5),
  C('r09','rare',"Secret Handshake","14 steps. Riley remembers all of them. His friend remembers 3.",'pity_speed',1.5),
  C('r10','rare',"Clutch Gene Activated","1 HP. Full comeback. Riley doesn't know how to lose slow.",'crash_multi',1),
  C('r11','rare',"Riley Blows on the Dice","Ancient technique. Success rate: disputed. Style points: maximum.",'dice_reroll_ones',1),
  C('r12','rare',"Snack-Fueled Focus","Riley with a bag of chips is Riley at 200% capacity.",'passive_income',4),
  C('r13','rare',"The Rally Cry","'WE'RE SO BACK' — Riley, seconds after being so over.",'coinflip_mult',1),
  C('r14','rare',"Discount Detective","Riley finds deals that don't exist. Cashiers fear him.",'pull_discount',0.5),
  C('r15','rare',"$5 in Old Jeans","The single greatest feeling known to Riley-kind.",'return_on_loss',0.5),
  C('r16','rare',"Sacred Gamer Crouch","Perched on the chair like a hawk. Peak performance posture.",'slot_win_mult',1),
  C('r17','rare',"Riley's Trash Talk","'You're about to get Riley'd.' Nobody knows what it means. It works.",'xp_gain',2),
  C('r18','rare',"Never Lucky? Always Lucky.","Riley complains about RNG while hitting back-to-back jackpots.",'jackpot_rate',0.1),
  C('r19','rare',"Big Brain Moment","Riley had a plan. The plan was 'click faster'. It worked.",'crash_multi',1),
  C('r20','rare',"The Wheel Respects Riley","It slows down where Riley's staring. Coincidence? Never.",'all_multi',0.5),
  C('r21','rare',"Bedtime Speedrun","In bed at 9. Asleep at 2. Personal best.",'passive_income',4),
  C('r22','rare',"Vibe Check: Passed","Riley's vibes have never once been off. Immaculate record.",'all_multi',0.5),
  C('r23','rare',"Fake Confidence","Riley has no idea what he's doing. Neither does the house. Advantage: Riley.",'coinflip_ins',1),
  C('r24','rare',"Hot Chip Survivor","Riley cried for 20 minutes and called it 'easy'. Respect.",'return_on_loss',0.5),
  C('r25','rare',"Lucky Number 7","Riley's favorite number, jersey, and average hours of sleep.",'slot_jackpot_rate',0.1),
  C('r26','rare',"The Dramatic Cash-Out","Riley slams the button from across the room. Nothing but net.",'crash_multi',1),
  C('r27','rare',"Dice Ritual","Shake 3 times, whisper 'trust', release. Patent pending.",'dice_reroll_ones',1),
  C('r28','rare',"Snooze Button Champion","Undefeated. 4,000 consecutive victories over mornings.",'passive_income',4),
  C('r29','rare',"Riley Respects the Grind","He doesn't do the grind. But he respects it deeply.",'xp_gain',3),
  C('r30','rare',"The Bet Splitter","Riley bets half, keeps half, forgets which half was which.",'bet_bonus',3),

  // ── EPICS (18) ────────────────────────────────────────────────────────────
  C('e01','epic',"Riley Enters the Zone","Headphones on. Hood up. The universe reroutes around him.",'all_multi',1),
  C('e02','epic',"The Golden Nap","Riley slept 14 hours and woke up richer. Passive income perfected.",'passive_income',8),
  C('e03','epic',"Jackpot Dream","Riley dreamed the winning spin. Then he did it awake.",'jackpot_rate',0.2),
  C('e04','epic',"Streak Sensei","Riley bows to the coin. The coin bows back. Wins continue.",'coinflip_mult',2),
  C('e05','epic',"Riley Defuses the Crash","Cuts the red wire at 9.99×. Sunglasses on. Walks away.",'crash_multi',2),
  C('e06','epic',"The Reel Bender","Riley stares at the reels hard enough that they get nervous.",'slot_win_mult',2),
  C('e07','epic',"Riley's Sixth Sense","He can feel a six coming. Goosebumps. Every time.",'dice_reroll_ones',2),
  C('e08','epic',"Totally Legal Insurance","Riley's streaks come with a warranty. Don't ask who signed it.",'coinflip_ins',2),
  C('e09','epic',"Riley's Refund Policy","Riley simply refuses some losses. The house hasn't noticed yet.",'return_on_loss',1),
  C('e10','epic',"The XP Vacuum","Riley absorbs experience from nearby players. Sorry, nearby players.",'xp_gain',5),
  C('e11','epic',"Riley Haggles the Shop","'Best I can do is 40% off.' The shopkeeper agreed out of fear.",'pull_discount',1.5),
  C('e12','epic',"Pity Party Accelerator","Riley's disappointment is so powerful it speeds up destiny.",'pity_speed',3),
  C('e13','epic',"Chaos Aura","Weird things happen near Riley. Profitable weird things.",'chaos_wild',1),
  C('e14','epic',"The Void Blinked First","Riley stared into the VOID segment. It quietly removed itself.",'wheel_void_remove',1),
  C('e15','epic',"Money Magnet Riley","Coins roll toward him on flat ground. Physicists baffled.",'bet_bonus',8),
  C('e16','epic',"Full-Combo Riley","Every input perfect. Every timing frame-tight. Certified moment.",'all_multi',1),
  C('e17','epic',"Heater Hands","Riley's hands are literally warm. The slots interpret this as friendship.",'slot_win_mult',2),
  C('e18','epic',"The Comeback Kid","Down 90%. One spin later: 'as I was saying—'",'crash_multi',2),

  // ── LEGENDARIES (9) ───────────────────────────────────────────────────────
  C('l01','legendary',"RILEY, DESTROYER OF ODDS","Probability filed a restraining order. It was denied.",'all_multi',2),
  C('l02','legendary',"The Infinite Snack Drawer","It never empties. Economists study it. Riley just eats.",'passive_income',12),
  C('l03','legendary',"The Golden Thumb","Everything Riley presses turns to profit. Including elevators.",'slot_win_mult',3),
  C('l04','legendary',"Streak Eternal","Riley's win streak is visible from space. NASA confirmed.",'coinflip_mult',3),
  C('l05','legendary',"Riley Outruns the Crash","The graph crashed. Riley had already left with the money.",'crash_multi',3),
  C('l06','legendary',"The Loaded Dice (Allegedly)","Investigated 7 times. Cleared 7 times. Suspiciously clean.",'dice_reroll_ones',3),
  C('l07','legendary',"Jackpot Magnetism","Jackpots hit near Riley 47% more often. This card is why.",'jackpot_rate',0.4),
  C('l08','legendary',"Riley's Extra Wheel Slice","Riley talked the wheel into adding a jackpot segment. Just asked nicely.",'wheel_jackpot',1),
  C('l09','legendary',"The House Fears Riley","There's a photo of Riley in the back office. Circled. In red.",'return_on_loss',2),

  // ── MYTHICS (3) ───────────────────────────────────────────────────────────
  C('m01','mythic',"RILEY ASCENDANT","He has seen the code behind the reels. He forgives it.",'all_multi',4),
  C('m02','mythic',"THE PROPHECY OF RILEY","'One day, a kid with mismatched slides will break the house.' — ancient scroll",'jackpot_rate',0.6),
  C('m03','mythic',"RILEY BREAKS THE SIMULATION","The RNG now asks Riley what it should roll. He usually says 'surprise me.'",'chaos_wild',2.5),

  // ── ★ RILEY SPECIALS (5) — animated GIF cards ★ ──────────────────────────
  { id:'s01', rarity:'riley', name:"★ RILEY: THE ORIGIN ★",
    text:"Where it all began. The first flip. The first W. History in motion.",
    boost:{ key:'all_multi', v:3 }, gif:'assets/cards/riley-1.gif' },
  { id:'s02', rarity:'riley', name:"★ RILEY: UNSTOPPABLE ★",
    text:"Caught on camera: Riley mid-streak. Scientists still can't slow this footage down.",
    boost:{ key:'coinflip_mult', v:4 }, gif:'assets/cards/riley-2.gif' },
  { id:'s03', rarity:'riley', name:"★ RILEY: MAIN CHARACTER ★",
    text:"The world renders in higher resolution around him. Watch closely.",
    boost:{ key:'crash_multi', v:4 }, gif:'assets/cards/riley-3.gif' },
  { id:'s04', rarity:'riley', name:"★ RILEY: JACKPOT INCARNATE ★",
    text:"This clip has been slowed 400% and it's still too much luck per frame.",
    boost:{ key:'jackpot_rate', v:0.5 }, gif:'assets/cards/riley-4.gif' },
  { id:'s05', rarity:'riley', name:"★ RILEY: FINAL FORM ★",
    text:"The last known footage before the house voluntarily closed for the day.",
    boost:{ key:'passive_income', v:20 }, gif:'assets/cards/riley-5.gif' },
];

export const CARDS_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));

// Complete-a-rarity set bonuses (small on purpose — see budget at top)
export const SET_BONUSES = [
  { rarity: 'common',    boost: { key: 'all_multi', v: 1 }, label: 'Common Set: +1% ALL multipliers' },
  { rarity: 'rare',      boost: { key: 'all_multi', v: 1 }, label: 'Rare Set: +1% ALL multipliers' },
  { rarity: 'epic',      boost: { key: 'jackpot_rate', v: 0.3 }, label: 'Epic Set: +0.3% jackpot rate' },
  { rarity: 'legendary', boost: { key: 'all_multi', v: 2 }, label: 'Legendary Set: +2% ALL multipliers' },
  { rarity: 'mythic',    boost: { key: 'all_multi', v: 2 }, label: 'Mythic Set: +2% ALL multipliers' },
  { rarity: 'riley',     boost: { key: 'all_multi', v: 4 }, label: '★ RILEY Set: +4% ALL multipliers ★' },
];

export function isSetComplete(ownedMap, rarity) {
  return CARDS.filter(c => c.rarity === rarity).every(c => ownedMap[c.id]);
}

// Summed card bonus for a stat key — owning a card counts ONCE (dupes = dust)
export function getCardBonusFromState(state, key) {
  const owned = state?.cards || {};
  let total = 0;
  for (const c of CARDS) {
    if (owned[c.id] && c.boost.key === key) total += c.boost.v;
  }
  for (const sb of SET_BONUSES) {
    if (sb.boost.key === key && isSetComplete(owned, sb.rarity)) total += sb.boost.v;
  }
  return total;
}
