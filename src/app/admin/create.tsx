import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { colors, fonts } from '@/theme';

const options=[
  {title:'Course',meta:'Lessons and learning media',icon:'school-outline' as const,route:'/admin/education?type=course'},
  {title:'Event',meta:'Upcoming and past sessions',icon:'calendar-outline' as const,route:'/admin/education?type=event'},
  {title:'Resource',meta:'Files, templates and links',icon:'document-text-outline' as const,route:'/admin/education?type=resource'},
  {title:'Opportunity',meta:'Jobs, internships and grants',icon:'briefcase-outline' as const,route:'/admin/content-editor?area=opportunities'},
  {title:'Notification',meta:'Message or scheduled reminder',icon:'notifications-outline' as const,route:'/admin/notifications'},
  {title:'Member Spotlight',meta:'Stories featured on Home',icon:'sparkles-outline' as const,route:'/admin/content?area=member-wins'},
  {title:'App content',meta:'Page copy and banners',icon:'create-outline' as const,route:'/admin/content-editor'},
];
export default function AdminCreate(){return <Screen><PageHeader title="Create"/><View style={styles.grid}>{options.map(item=><Pressable key={item.title} onPress={()=>router.push(item.route as never)} style={styles.card}><View style={styles.icon}><Ionicons name={item.icon} size={22} color={colors.ink}/></View><View style={styles.body}><Text style={styles.title}>{item.title}</Text><Text style={styles.meta}>{item.meta}</Text></View><Ionicons name="arrow-forward" size={18} color={colors.ink}/></Pressable>)}</View></Screen>}
const styles=StyleSheet.create({grid:{gap:9},card:{minHeight:79,borderRadius:17,borderWidth:1,borderColor:'#DFDCDF',backgroundColor:colors.surface,padding:11,flexDirection:'row',alignItems:'center'},icon:{width:47,height:47,borderRadius:14,backgroundColor:'#F1F0F1',alignItems:'center',justifyContent:'center'},body:{flex:1,paddingHorizontal:12},title:{fontFamily:fonts.headingBold,fontSize:14,color:colors.ink},meta:{fontFamily:fonts.body,fontSize:9.5,color:colors.muted,marginTop:3}});
