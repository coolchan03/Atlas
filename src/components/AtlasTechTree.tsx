import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme';

interface Tech { id: string; name: string; cost: number; requires: string[] }
export const TECH_TREE: Tech[] = [
  { id:'agri', name:'Agriculture', cost:2, requires:[] },
  { id:'pottery', name:'Pottery', cost:2, requires:['agri'] },
  { id:'writing', name:'Writing', cost:2, requires:['pottery'] },
  { id:'math', name:'Mathematics', cost:3, requires:['writing'] },
  { id:'metal', name:'Metallurgy', cost:3, requires:[] },
  { id:'engineering', name:'Engineering', cost:3, requires:['math','metal'] },
  { id:'electricity', name:'Electricity', cost:3, requires:['engineering'] },
  { id:'rocketry', name:'Rocketry', cost:4, requires:['electricity'] },
  { id:'space', name:'Spaceflight', cost:5, requires:['rocketry'] },
  { id:'art', name:'Fine Arts', cost:4, requires:['writing'] },
  { id:'trade', name:'Trade Routes', cost:4, requires:['agri'] },
];

export function AtlasTechTree() {
  const { colors } = useTheme();
  const [unlocked,setUnlocked] = useState<string[]>([]);
  const [science,setScience] = useState(30);
  const [turn,setTurn] = useState(0);
  const won = unlocked.includes('space');
  const research = (tech: Tech) => {
    if (unlocked.includes(tech.id) || won || tech.cost > science || !tech.requires.every(id=>unlocked.includes(id))) return;
    setUnlocked(ids=>[...ids,tech.id]);setScience(value=>value-tech.cost);setTurn(t=>t+1);
  };
  const restart = () => {setUnlocked([]);setScience(30);setTurn(0);};
  return <View style={{gap:12}}>
    <Text style={{color:colors.text,fontSize:19}}>Civilization Tech Tree</Text>
    <Text style={{color:colors.textSecondary}}>Science: {science} · Research actions: {turn} · Goal: unlock Spaceflight</Text>
    {won && <Text style={{color:colors.text,fontSize:20}}>Spaceflight unlocked! Your civilization reached the stars.</Text>}
    {!won && science < 5 && <Text style={{color:colors.error}}>Limited science remains. You may need to restart and avoid optional technologies.</Text>}
    {TECH_TREE.map(tech=>{
      const done=unlocked.includes(tech.id), prerequisites=tech.requires.every(id=>unlocked.includes(id));
      const enabled=!done&&prerequisites&&tech.cost<=science&&!won;
      return <TouchableOpacity key={tech.id} disabled={!enabled} onPress={()=>research(tech)} style={{padding:12,borderRadius:9,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,opacity:enabled||done?1:0.55}}>
        <Text style={{color:colors.text,fontWeight:'600'}}>{done?'✓ ':prerequisites?'◯ ':'🔒 '}{tech.name} · {tech.cost} science</Text>
        <Text style={{color:colors.textSecondary,fontSize:12}}>{done?'Researched':tech.requires.length?'Requires: '+tech.requires.map(id=>TECH_TREE.find(t=>t.id===id)?.name).join(', '):'Available from the start'}</Text>
      </TouchableOpacity>;
    })}
    <TouchableOpacity onPress={restart} style={{padding:13,backgroundColor:colors.surface,borderRadius:9}}><Text style={{color:colors.text,textAlign:'center'}}>Restart civilization</Text></TouchableOpacity>
  </View>;
}
