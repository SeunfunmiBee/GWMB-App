/* eslint-disable react-hooks/set-state-in-effect */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { contentAreas, listAdminContent, type ContentItem } from '@/lib/admin-content';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

export default function AdminContentList(){
  const { area: rawArea }=useLocalSearchParams<{area?:string}>(); const area=rawArea??'home'; const {isAdmin}=useAuth();
  const [items,setItems]=useState<ContentItem[]>([]); const [busy,setBusy]=useState(true);
  const load=useCallback(async()=>{setBusy(true);const result=await listAdminContent(area);setItems(result.data);setBusy(false)},[area]);
  useEffect(()=>{if(isAdmin)void load()},[isAdmin,load]);
  const label=contentAreas.find(([value])=>value===area)?.[1]??'Content';
  return <Screen><PageHeader eyebrow="ADMIN CONTENT" title={label}/><Pressable onPress={()=>router.push(`/admin/content-editor?area=${area}` as never)} style={styles.create}><Ionicons name="add" size={19} color="white"/><Text style={styles.createText}>{area==='member-wins'?'Post a Spotlight':'Add new'}</Text></Pressable>{busy?<ActivityIndicator style={styles.busy} color={colors.pinkDeep}/>:items.length===0?<View style={styles.empty}><Text style={styles.emptyTitle}>No content yet</Text><Text style={styles.copy}>Create the first editable item for this section.</Text></View>:<View style={styles.list}>{items.map(item=><Pressable key={item.id} onPress={()=>router.push(`/admin/content-editor?id=${item.id}` as never)} style={styles.card}>{item.image_url?<Image source={{uri:item.image_url}} style={styles.thumb}/>:<View style={styles.icon}><Ionicons name={area==='member-wins'?'star-outline':'document-text-outline'} size={20} color={colors.pinkDeep}/></View>}<View style={styles.body}><View style={styles.meta}><Text style={styles.type}>{item.content_type.replaceAll('_',' ')}</Text><Text style={[styles.status,item.status==='published'&&styles.live]}>{item.status}</Text></View><Text style={styles.title}>{item.title}</Text><Text numberOfLines={2} style={styles.copy}>{item.summary||'No summary yet'}</Text></View><Ionicons name="create-outline" size={17} color={colors.muted}/></Pressable>)}</View>}</Screen>
}
const styles=StyleSheet.create({create:{height:48,borderRadius:15,backgroundColor:colors.pinkDeep,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,marginBottom:15},createText:{fontFamily:fonts.bodyBold,fontSize:11,color:'white'},busy:{marginTop:80},empty:{padding:25,borderRadius:22,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line,alignItems:'center'},emptyTitle:{fontFamily:fonts.heading,fontSize:18,color:colors.ink},list:{gap:9},card:{minHeight:100,borderRadius:18,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:12,flexDirection:'row',alignItems:'center'},thumb:{width:49,height:62,borderRadius:13,backgroundColor:colors.pinkSoft},icon:{width:49,height:49,borderRadius:15,backgroundColor:colors.pinkSoft,alignItems:'center',justifyContent:'center'},body:{flex:1,minWidth:0,paddingHorizontal:11},meta:{flexDirection:'row',alignItems:'center',gap:7},type:{fontFamily:fonts.bodyBold,fontSize:8,color:colors.pinkDeep,textTransform:'uppercase'},status:{fontFamily:fonts.bodyBold,fontSize:8,color:colors.muted,textTransform:'uppercase'},live:{color:'#087553'},title:{fontFamily:fonts.headingBold,fontSize:13,lineHeight:18,color:colors.ink,marginTop:5},copy:{fontFamily:fonts.body,fontSize:9,lineHeight:14,color:colors.muted,marginTop:3}});
