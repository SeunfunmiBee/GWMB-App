import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { cliqueById } from '@/data/cliques';
import { loadJoinedCliques } from '@/lib/clique-store';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

export function MyCliquesPanel({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { user, membership } = useAuth();
  const [ids, setIds] = useState<string[]>([]);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    if (!user?.id || membership?.status !== 'verified') { setIds([]); return () => { mounted = false; }; }
    void loadJoinedCliques(user.id).then(value => { if (mounted) setIds(value); });
    return () => { mounted = false; };
  }, [membership, user]));

  if (membership?.status !== 'verified') return null;
  const joined = ids.map(id => cliqueById[id]).filter(Boolean);

  return <View style={[styles.wrapper, compact && styles.wrapperCompact]}>
    <View style={styles.heading}><View><Text style={styles.kicker}>MEMBER COMMUNITY</Text><Text style={styles.title}>My Cliques</Text></View><Pressable onPress={() => router.push('/cliques')}><Text style={styles.link}>{joined.length ? 'Manage' : 'Explore'}</Text></Pressable></View>
    {joined.length ? <View style={styles.list}>{joined.map(clique => <Pressable key={clique.id} onPress={() => router.push('/cliques')} style={styles.row}><Image source={clique.image} style={styles.image}/><View style={styles.copy}><Text style={styles.cliqueTitle}>{clique.title}</Text><Text style={styles.meetingLabel}>NEXT CLIQUE MEETING</Text><Text style={styles.meeting} numberOfLines={1}>{clique.meeting.date}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>)}</View> : <Pressable onPress={() => router.push('/cliques')} style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="people-outline" size={22} color={colors.pinkDeep}/></View><View style={styles.copy}><Text style={styles.emptyTitle}>Find your people</Text><Text style={styles.emptyText}>Join a members-only clique around your career or interests.</Text></View><Ionicons name="arrow-forward" size={18} color={colors.ink}/></Pressable>}
  </View>;
}

const styles=StyleSheet.create({wrapper:{marginTop:25},wrapperCompact:{marginTop:14},heading:{flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between',marginBottom:10},kicker:{color:colors.pinkDeep,fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:1,marginBottom:3},title:{color:colors.ink,fontSize:18,fontFamily:fonts.heading},link:{color:colors.pinkDeep,fontSize:9,fontFamily:fonts.bodyBold},list:{gap:8},row:{minHeight:83,borderRadius:19,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line,padding:10,flexDirection:'row',alignItems:'center',gap:11},image:{width:60,height:60,borderRadius:15},copy:{flex:1,minWidth:0},cliqueTitle:{color:colors.ink,fontSize:13,fontFamily:fonts.headingBold},meetingLabel:{color:colors.pinkDeep,fontSize:7,fontFamily:fonts.bodyBold,letterSpacing:.75,marginTop:5},meeting:{color:colors.muted,fontSize:8,fontFamily:fonts.bodyMedium,marginTop:2},empty:{minHeight:90,borderRadius:20,backgroundColor:colors.pinkSoft,padding:13,flexDirection:'row',alignItems:'center',gap:11},emptyIcon:{width:48,height:48,borderRadius:16,backgroundColor:'white',alignItems:'center',justifyContent:'center'},emptyTitle:{color:colors.ink,fontSize:13,fontFamily:fonts.headingBold},emptyText:{color:colors.muted,fontSize:9,lineHeight:14,fontFamily:fonts.body,marginTop:3},
});
