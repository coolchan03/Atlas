/**
 * Survival drills: short branching scenarios written by hand from the Atlas
 * emergency cards (each choice names the card it comes from). No model at play
 * time, so the advice cannot drift from the cards.
 */
export interface DrillChoice { text: string; next: string | null; good: boolean; why: string; card: string }
export interface DrillNode { text: string; choices: DrillChoice[] }
export interface Drill { id: string; title: string; icon: string; start: string; nodes: Record<string, DrillNode> }

export const DRILLS: Drill[] = [
  {
    id: 'lost-dusk', title: 'Lost at dusk', icon: 'compass', start: 'a',
    nodes: {
      a: { text: 'You left the trail and cannot find it again. It will be dark in about an hour. Your phone has 20% battery and no signal. Someone knows roughly where you went.', choices: [
        { text: 'Keep walking fast to find the trail before dark', next: 'b', good: false, why: 'Moving makes you harder to find, and panic wastes energy. Searchers look along your planned route.', card: 'S01' },
        { text: 'Stop. Sit, think, observe, plan. Stay near where you are', next: 'b', good: true, why: 'STOP first. If anyone knows roughly where you are, staying put is usually best.', card: 'S01' },
      ] },
      b: { text: 'You decide what to do with the phone.', choices: [
        { text: 'Open Maps (GPS works without signal), write down your coordinates, then save battery', next: 'c', good: true, why: 'GPS works with no signal. Write the coordinates down in case the phone dies.', card: 'S01' },
        { text: 'Keep trying to call over and over', next: 'c', good: false, why: 'A phone hunting for signal drains fast. A short text can get through when a call cannot; texts retry on their own.', card: 'PW01' },
      ] },
      c: { text: 'You hear an aircraft in the distance and you have a whistle.', choices: [
        { text: 'Blow 3 blasts, pause, repeat; make a bright, visible spot in the open', next: null, good: true, why: '3 of anything means help. A whistle carries much further than shouting.', card: 'S01' },
        { text: 'Shout as loud as you can until it is gone', next: null, good: false, why: 'Shouting carries poorly and tires you. Use 3 whistle blasts and something bright or shiny.', card: 'S01' },
      ] },
    },
  },
  {
    id: 'bleed', title: 'Severe bleeding', icon: 'droplet', start: 'a',
    nodes: {
      a: { text: 'A friend cuts their forearm deeply on glass. Blood is flowing steadily.', choices: [
        { text: 'Press hard right on the bleeding spot with a clean cloth', next: 'b', good: true, why: 'Firm direct pressure on the source is the first step. Raise the arm above the heart too.', card: 'E01' },
        { text: 'Put on a tourniquet straight away', next: 'b', good: false, why: 'A tourniquet is a last resort for life-threatening bleeding after pressure has failed. It can cost the limb.', card: 'E01' },
      ] },
      b: { text: 'The cloth soaks through with blood.', choices: [
        { text: 'Pull it off to look at the wound', next: 'c', good: false, why: 'Pulling it off tears away the clots. Leave it.', card: 'E01' },
        { text: 'Leave it, add another pad on top and keep pressing', next: 'c', good: true, why: 'Add pads on top and keep pressing.', card: 'E01' },
      ] },
      c: { text: 'The bleeding stops. Your friend now feels dizzy, pale and sweaty, with a fast heartbeat.', choices: [
        { text: 'Lay them flat if they can tolerate it and keep watching the wound', next: null, good: true, why: 'These are signs of shock. Lay them flat and keep the bleeding controlled; get care if any exists.', card: 'E01' },
        { text: 'Have them walk it off to get the blood moving', next: null, good: false, why: 'Dizziness, pallor and a fast pulse after blood loss are signs of shock. Lay them flat.', card: 'E01' },
      ] },
    },
  },
  {
    id: 'snake', title: 'Snakebite', icon: 'alert-triangle', start: 'a',
    nodes: {
      a: { text: 'Someone is bitten on the ankle by a snake on the trail. The snake is still nearby.', choices: [
        { text: 'Move away from the snake; do not try to catch or kill it', next: 'b', good: true, why: 'Get away from the snake. Take a photo only if you can do it safely from a distance.', card: 'E02' },
        { text: 'Kill the snake so a doctor can identify it', next: 'b', good: false, why: 'Trying to capture or kill it risks a second bite.', card: 'E02' },
      ] },
      b: { text: 'What do you do for the bite?', choices: [
        { text: 'Cut the wound and suck out the venom', next: 'c', good: false, why: 'Never cut or suck the bite, and do not use a tourniquet or ice.', card: 'E02' },
        { text: 'Keep them calm and still, remove rings and watches, wash and cover the bite', next: 'c', good: true, why: 'Calm, still, jewellery off before swelling, wash, clean dry dressing.', card: 'E02' },
      ] },
      c: { text: 'The swelling is spreading.', choices: [
        { text: 'Mark the edge of the swelling with a pen, write the time, and get to emergency care', next: null, good: true, why: 'Marking shows how fast it spreads. Antivenom may be needed.', card: 'E02' },
        { text: 'Put ice on it to slow the venom', next: null, good: false, why: 'Do not use ice or soak the bite. Mark the swelling and get to care.', card: 'E02' },
      ] },
    },
  },
  {
    id: 'heat', title: 'Collapse in the heat', icon: 'sun', start: 'a',
    nodes: {
      a: { text: 'On a hot afternoon a hiker becomes confused and starts slurring. Their skin is very hot.', choices: [
        { text: 'Treat it as heat stroke: cool them FAST', next: 'b', good: true, why: 'Confusion with very hot skin is heat stroke, a deadly emergency. Fast cooling matters more than anything else.', card: 'E08' },
        { text: 'Give them a big drink and let them rest in the sun', next: 'b', good: false, why: 'Do not give fluids to someone confused. Move them out of the sun and cool them fast.', card: 'E08' },
      ] },
      b: { text: 'There is a cold stream nearby.', choices: [
        { text: 'Put the body in the cold water up to the neck', next: null, good: true, why: 'Cold-water immersion is the best way to cool. Otherwise soak and fan, cold packs at the neck, armpits and groin.', card: 'E08' },
        { text: 'Cover them with a blanket to avoid shivering', next: null, good: false, why: 'They need to lose heat. Keep cooling until they are clearly better.', card: 'E08' },
      ] },
    },
  },
  {
    id: 'choke', title: 'Choking at dinner', icon: 'wind', start: 'a',
    nodes: {
      a: { text: 'An adult at the table grabs their throat. They cannot speak, cough or breathe.', choices: [
        { text: 'Encourage them to cough and wait', next: 'b', good: false, why: 'If they cannot cough, speak or breathe, act now.', card: 'E05' },
        { text: 'Give 5 firm back blows, then 5 abdominal thrusts', next: 'b', good: true, why: 'Lean them forward, 5 back blows between the shoulder blades, then 5 abdominal thrusts. Repeat.', card: 'E05' },
      ] },
      b: { text: 'They go limp and stop responding.', choices: [
        { text: 'Lower them to the ground and start CPR', next: null, good: true, why: 'Start CPR. Each time you open the mouth, remove the object only if you can see it.', card: 'E05' },
        { text: 'Sweep your fingers blindly in their mouth', next: null, good: false, why: 'Never sweep blindly. Start CPR and remove the object only if you can see it.', card: 'E05' },
      ] },
    },
  },
  {
    id: 'water', title: 'Only river water', icon: 'droplet', start: 'a',
    nodes: {
      a: { text: 'Your water has run out. A river is nearby; the water is cloudy.', choices: [
        { text: 'Let it settle and pour it through a clean cloth first', next: 'b', good: true, why: 'Disinfection works less well in cloudy water. Settle and filter first.', card: 'W01' },
        { text: 'Drink it straight; flowing water is always safe', next: 'b', good: false, why: 'Flowing water is better than still water, but it still needs disinfecting.', card: 'W01' },
      ] },
      b: { text: 'You have a stove and fuel. You are at a low altitude.', choices: [
        { text: 'Bring it to a rolling boil for at least 1 minute', next: null, good: true, why: 'Boiling is the best method: 1 minute at a rolling boil (3 minutes above 5,000 ft / 1,000 m).', card: 'W01' },
        { text: 'Warm it until it steams', next: null, good: false, why: 'Steaming is not enough. It needs a rolling boil for at least 1 minute.', card: 'W01' },
      ] },
    },
  },
  {
    id: 'cold', title: 'Soaked and freezing', icon: 'cloud-snow', start: 'a',
    nodes: {
      a: { text: 'After falling into a creek, your companion is shivering, fumbling and confused. It is windy and 45°F (7°C).', choices: [
        { text: 'It is too warm for hypothermia; keep hiking', next: 'b', good: false, why: 'Hypothermia can happen even above 40°F (4°C) when someone is wet and chilled.', card: 'E03' },
        { text: 'Get them into shelter, out of the wind, and take off the wet clothing', next: 'b', good: true, why: 'Shelter, wet clothes off, warm the body under dry layers.', card: 'E03' },
      ] },
      b: { text: 'Their fingers are white, hard and numb.', choices: [
        { text: 'Rub them hard to bring the blood back', next: null, good: false, why: 'Do not rub or massage frostbitten skin.', card: 'E03' },
        { text: 'Rewarm in water that feels warm to the touch, not hot; no fire or stove heat', next: null, good: true, why: 'Warm (not hot) water. No direct strong heat like a fire, stove or heating pad.', card: 'E03' },
      ] },
    },
  },
  {
    id: 'battery', title: 'Phone at 5%', icon: 'battery', start: 'a',
    nodes: {
      a: { text: 'You are stranded overnight and the phone is nearly dead.', choices: [
        { text: 'Turn on battery saver and airplane mode; GPS still works', next: 'b', good: true, why: 'A phone hunting for signal is the biggest drain. Airplane mode does not turn off GPS.', card: 'PW01' },
        { text: 'Keep the screen bright so you notice messages', next: 'b', good: false, why: 'Dim the screen, use dark mode and short timeouts. Check for messages on a schedule.', card: 'PW01' },
      ] },
      b: { text: 'You find a car with a working 12 V socket and a USB adapter.', choices: [
        { text: 'Charge from the 12 V socket with the USB adapter (engine running if you can)', next: null, good: true, why: 'A 12 V-to-USB adapter regulates the voltage. With the engine off, keep it to about an hour.', card: 'PW01' },
        { text: 'Wire the phone cable straight to the car battery', next: null, good: false, why: 'Never wire a phone straight to a battery or panel. Anything over about 5.5 V without a regulator can kill it.', card: 'PW01' },
      ] },
    },
  },
];
