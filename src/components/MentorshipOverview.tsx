import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DestinationHeader } from '@/components/DestinationHeader';
import { Screen } from '@/components/Screen';
import { colors, fonts } from '@/theme';

const mentorshipTypes = [
  { key:'discovery', title:'Discovery Mentorship', promise:'Explore careers before you choose.', icon:'compass-outline' as const, tone:'#7047D8', colors:['#38156F','#984ADA','#F06EBB'] as const },
  { key:'industry', title:'Industry Mentorship', promise:'Grow in your chosen field.', icon:'briefcase-outline' as const, tone:'#3150E8', colors:['#10285F','#225ED0','#46C3E7'] as const },
  { key:'one-on-one', title:'One-on-One Mentorship', promise:'Get focused personal guidance.', icon:'chatbubble-ellipses-outline' as const, tone:'#C51F68', colors:['#681239','#C51F68','#FF87AA'] as const },
];

const supportingDestinations = [
  { key:'mentors', title:'Meet Our Mentors', copy:'Find guidance by industry and expertise.', icon:'people-outline' as const, surface:'#E8EEFF', accent:'#3150E8', image:require('../../assets/media/community/member-01.png') },
  { key:'my', title:'My Mentorship', copy:'See your sessions and applications.', icon:'sparkles-outline' as const, surface:'#E3F5F1', accent:'#087A67' },
];

export function MentorshipOverview() {
  return (
    <Screen>
      <DestinationHeader compact eyebrow="MENTORSHIP & GUIDANCE" title="Connect with mentors." copy="Find the right guidance for your next move." colors={['#111B55','#294ED1','#697FF2','#4EB8DD']}/>

      <View style={styles.head}>
        <Text style={styles.kicker}>THREE WAYS TO BE MENTORED</Text>
        <Text style={styles.sectionTitle}>Choose your mentorship.</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={176} contentContainerStyle={styles.experienceList}>
        {mentorshipTypes.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => router.push(`/mentorship/${item.key}` as Href)}
            style={({ pressed }) => [styles.experienceTouch, pressed && styles.experiencePressed]}
          >
            <LinearGradient colors={item.colors} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.experienceCard}>
              <View style={styles.cardOrb}/><View style={styles.cardOrbSmall}/><View style={styles.cardShine}/>
              <View style={styles.experienceIcon}><Ionicons name={item.icon} size={22} color={item.tone}/></View>
              <View style={styles.experienceCopy}>
                <Text style={styles.experienceTitle}>{item.title}</Text>
              </View>
            </LinearGradient>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.exploreHead}><Text style={styles.exploreLabel}>EXPLORE MORE</Text><Ionicons name="arrow-forward" size={18} color={colors.ink}/></View>
      <View style={styles.supportingList}>
        {supportingDestinations.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => router.push(`/mentorship/${item.key}` as Href)}
            style={({ pressed }) => [styles.supportingCard, {backgroundColor:item.surface}, item.image&&styles.supportingImageCard, pressed && styles.supportingPressed]}
          >
            {item.image?<><Image source={item.image} resizeMode="cover" style={styles.supportingImage}/><LinearGradient colors={['rgba(13,22,61,.02)','rgba(13,22,61,.88)']} style={styles.supportingOverlay}><View style={styles.supportingCopyImage}><Text style={styles.supportingTitleImage}>{item.title}</Text><Text style={styles.supportingTextImage}>{item.copy}</Text></View><View style={styles.supportingArrowImage}><Ionicons name="arrow-forward" size={15} color={colors.ink}/></View></LinearGradient></>:<><View style={[styles.supportingIcon,{backgroundColor:'white'}]}><Ionicons name={item.icon} size={23} color={item.accent}/></View><View style={styles.supportingCopy}><Text style={styles.supportingTitle}>{item.title}</Text><Text style={styles.supportingText}>{item.copy}</Text></View><View style={[styles.supportingArrow,{backgroundColor:item.accent}]}><Ionicons name="arrow-forward" size={15} color="white"/></View></>}
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles=StyleSheet.create({
  hero:{minHeight:266,borderRadius:28,padding:21,justifyContent:'center',overflow:'hidden',borderWidth:1,borderColor:'#2443B4'},
  orbit:{position:'absolute',right:-50,top:-65,width:200,height:200,borderRadius:100,borderWidth:36,borderColor:'rgba(255,255,255,.12)'},
  heroGlow:{position:'absolute',left:-62,bottom:-104,width:220,height:220,borderRadius:110,backgroundColor:'rgba(255,255,255,.10)'},
  heroKicker:{position:'absolute',left:21,top:21,color:'white',fontSize:8,fontFamily:fonts.bodyBold,letterSpacing:1.1},
  heroTitle:{color:'white',fontSize:29,lineHeight:33,fontFamily:fonts.heading,letterSpacing:-1,textAlign:'center',alignSelf:'center'},
  heroCopy:{color:'rgba(255,255,255,.80)',fontSize:10,lineHeight:15,fontFamily:fonts.bodyMedium,textAlign:'center',alignSelf:'center',marginTop:7},
  head:{marginTop:23,marginBottom:11},
  kicker:{color:colors.pinkDeep,fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.95},
  sectionTitle:{color:colors.ink,fontSize:20,lineHeight:25,fontFamily:fonts.heading,letterSpacing:-.5,marginTop:4},
  experienceList:{gap:10,paddingRight:18},
  experienceTouch:{width:166},
  experienceCard:{height:160,borderRadius:25,padding:16,overflow:'hidden',justifyContent:'space-between'},
  experiencePressed:{transform:[{scale:.985}],opacity:.94},
  cardOrb:{position:'absolute',right:-30,top:-34,width:128,height:128,borderRadius:64,backgroundColor:'rgba(255,255,255,.13)'},
  cardOrbSmall:{position:'absolute',right:29,top:32,width:68,height:68,borderRadius:34,borderWidth:14,borderColor:'rgba(255,255,255,.11)'},
  cardShine:{position:'absolute',left:-32,bottom:-48,width:132,height:92,borderRadius:46,backgroundColor:'rgba(255,255,255,.09)',transform:[{rotate:'-18deg'}]},
  experienceIcon:{width:46,height:46,borderRadius:15,backgroundColor:'white',alignItems:'center',justifyContent:'center'},
  experienceCopy:{paddingRight:7},
  experienceTitle:{color:'white',fontSize:17,lineHeight:20,fontFamily:fonts.heading,letterSpacing:-.45},
  exploreHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:25,marginBottom:10},
  exploreLabel:{color:colors.pinkDeep,fontSize:9,fontFamily:fonts.bodyBold,letterSpacing:.95},
  supportingList:{flexDirection:'row',gap:10},
  supportingCard:{width:'48.5%',minHeight:166,borderRadius:23,borderWidth:1,borderColor:'rgba(17,16,17,.06)',padding:14},
  supportingImageCard:{padding:0,overflow:'hidden',borderColor:'rgba(17,16,17,.10)'},
  supportingImage:{position:'absolute',top:0,right:0,bottom:0,left:0,width:'100%',height:'100%'},
  supportingOverlay:{flex:1,padding:14,justifyContent:'flex-end'},
  supportingCopyImage:{paddingRight:4,paddingBottom:31},
  supportingTitleImage:{color:'white',fontSize:15,lineHeight:18,fontFamily:fonts.headingBold},
  supportingTextImage:{color:'rgba(255,255,255,.82)',fontSize:9,lineHeight:13,fontFamily:fonts.body,marginTop:5},
  supportingArrowImage:{position:'absolute',right:12,bottom:12,width:31,height:31,borderRadius:16,backgroundColor:'white',alignItems:'center',justifyContent:'center'},
  supportingPressed:{borderColor:colors.pink,transform:[{translateY:-1}]},
  supportingIcon:{width:44,height:44,borderRadius:15,alignItems:'center',justifyContent:'center'},
  supportingCopy:{flex:1,paddingTop:15,paddingRight:4},
  supportingTitle:{color:colors.ink,fontSize:15,lineHeight:18,fontFamily:fonts.headingBold},
  supportingText:{color:colors.muted,fontSize:9,lineHeight:13,fontFamily:fonts.body,marginTop:5},
  supportingArrow:{position:'absolute',right:12,bottom:12,width:31,height:31,borderRadius:16,alignItems:'center',justifyContent:'center'},
});
