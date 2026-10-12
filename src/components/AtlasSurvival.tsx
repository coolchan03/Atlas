import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';

type Choice = { label: string; food: number; water: number; warmth: number; result: string };
type Scenario = { story: string; options: Choice[] };
const scenarios: Scenario[] = [
  { story: 'You have one day to prepare a wilderness shelter before dusk.', options: [
    { label:'Collect wood and build a shelter', food:-1, water:-1, warmth:3, result:'A sturdy shelter keeps you warmer.' },
    { label:'Search for berries', food:3, water:-1, warmth:-2, result:'You find food but lose daylight.' },
    { label:'Hike toward the river', food:-1, water:3, warmth:-2, result:'You locate fresh water before nightfall.' },
  ]},
  { story: 'Night falls and temperatures drop sharply.', options: [
    { label:'Tend a small fire', food:-1, water:-1, warmth:3, result:'The fire helps you through the cold.' },
    { label:'Rest to save energy', food:0, water:-1, warmth:-2, result:'You rest but the cold becomes difficult.' },
    { label:'Forage after dark', food:2, water:-2, warmth:-2, result:'You find some food but get chilled.' },
  ]},
  { story: 'Morning brings a long, dry hike.', options: [
    { label:'Follow a streambed', food:-2, water:3, warmth:-1, result:'The streambed leads to clean water.' },
    { label:'Take a direct ridge route', food:-1, water:-3, warmth:1, result:'The ridge is sunny and exposed.' },
    { label:'Stay in camp and conserve strength', food:-1, water:-1, warmth:2, result:'The shelter buys time but supplies run low.' },
  ]},
  { story: 'A storm approaches your temporary camp.', options: [
    { label:'Reinforce the shelter', food:-1, water:-1, warmth:3, result:'You weather the storm under cover.' },
    { label:'Collect rainwater', food:-1, water:4, warmth:-3, result:'You fill your containers but get soaked.' },
    { label:'Travel before the storm hits', food:-3, water:-2, warmth:-1, result:'You gain ground but expend precious resources.' },
  ]},
  { story: 'A rescue trail marker appears ahead. One final push remains.', options: [
    { label:'Eat and hike carefully', food:-3, water:-2, warmth:-1, result:'You head toward the rescue trail.' },
    { label:'Wait for daylight and signal', food:-1, water:-1, warmth:-2, result:'You make a visible signal at dawn.' },
    { label:'Follow the creek downstream', food:-2, water:2, warmth:-2, result:'The creek leads closer to civilization.' },
  ]},
];
export function AtlasSurvival() {
  const { colors } = useTheme();
  const [day,setDay] = useState(0);
  const [food,setFood] = useState(6);
  const [water,setWater] = useState(6);
  const [warmth,setWarmth] = useState(6);
  const [history,setHistory] = useState('');
  const lost = food <= 0 || water <= 0 || warmth <= 0;
  const finished = day === scenarios.length;
  const restart = () => { setDay(0);setFood(6);setWater(6);setWarmth(6);setHistory(''); };
  const choose = (choice: Choice) => {
    setFood(v=>v+choice.food);setWater(v=>v+choice.water);setWarmth(v=>v+choice.warmth);
    setHistory(choice.result);setDay(d=>d+1);
  };
  return <View style={{ gap:12 }}>
    <Text style={{ color:colors.text, fontSize:19 }}>Wilderness Survival · Stage {Math.min(day+1,scenarios.length)}/{scenarios.length}</Text>
    <Text style={{ color:colors.textSecondary }}>Food: {food} · Water: {water} · Warmth: {warmth}</Text>
    {!!history && <Text style={{ color:colors.textSecondary }}>{history}</Text>}
    {lost ? <Text style={{ color:colors.error, fontSize:20 }}>Your supplies ran out. Try a different strategy!</Text>
      : finished ? <Text style={{ color:colors.text,fontSize:20 }}>You made it to rescue. You survived!</Text>
      : <>
        <Text style={{ color:colors.text,fontSize:19 }}>{scenarios[day].story}</Text>
        {scenarios[day].options.map((choice,i)=><TouchableOpacity key={i} onPress={()=>choose(choice)} style={{ padding:13,borderColor:colors.border,borderWidth:1,borderRadius:9,backgroundColor:colors.surface }}>
          <Text style={{ color:colors.text }}>{choice.label}</Text>
          <Text style={{ color:colors.textSecondary, fontSize:12 }}>Food {choice.food>=0?'+':''}{choice.food} · Water {choice.water>=0?'+':''}{choice.water} · Warmth {choice.warmth>=0?'+':''}{choice.warmth}</Text>
        </TouchableOpacity>)}
      </>}
    <TouchableOpacity onPress={restart} style={{ padding:13,backgroundColor:colors.surface,borderRadius:9 }}><Text style={{ color:colors.text,textAlign:'center' }}>Restart survival challenge</Text></TouchableOpacity>
  </View>;
}
