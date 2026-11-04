import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { SignInGate } from '@/components/SignInGate';
import { disablePushForUser, loadNotificationPreferences, registerPushDevice, updateNotificationPreferences, type NotificationPreferences } from '@/lib/notification-store';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

const categoryRows=[
  ['events_enabled','Events & reminders','calendar-outline'],
  ['opportunities_enabled','Opportunities','briefcase-outline'],
  ['learning_enabled','Learning progress','play-circle-outline'],
  ['community_enabled','Community updates','people-outline'],
  ['newsletter_enabled','GWMB newsletter','mail-outline'],
] as const;
const timingRows=[
  ['reminder_24h','24 hours before'],
  ['reminder_1h','1 hour before'],
  ['reminder_live','When the event goes live'],
] as const;

export default function Settings(){
  const{user}=useAuth();
  const[preferences,setPreferences]=useState<NotificationPreferences|null>(null);
  const[loading,setLoading]=useState(Boolean(user));
  const[saving,setSaving]=useState(false);

  useEffect(()=>{let active=true;if(!user)return()=>{active=false};loadNotificationPreferences(user.id).then(({preferences:next})=>{if(active){setPreferences(next);setLoading(false)}});return()=>{active=false}},[user]);
  if(!user)return <Screen><PageHeader title="Settings" eyebrow="Notifications & privacy"/><SignInGate title="Sign in to manage your settings" copy="Notification preferences and privacy controls belong to your GWMB account."/></Screen>;
  if(loading||!preferences)return <Screen><PageHeader title="Settings" eyebrow="Notifications & privacy"/><View style={styles.loading}><ActivityIndicator color={colors.pinkDeep}/></View></Screen>;

  async function save(patch:Partial<NotificationPreferences>){if(!user||!preferences)return;const optimistic={...preferences,...patch};setPreferences(optimistic);setSaving(true);const result=await updateNotificationPreferences(user.id,optimistic);setSaving(false);if(result.error){setPreferences(preferences);Alert.alert('Could not save settings',result.error.message)}else setPreferences(result.preferences)}
  async function togglePush(value:boolean){if(!user||saving)return;if(!value){setPreferences(current=>current?{...current,push_enabled:false}:current);await disablePushForUser(user.id);return}setSaving(true);const result=await registerPushDevice(user.id,true);setSaving(false);if(!result.enabled){Alert.alert(Platform.OS==='web'?'Open the Android app':'Push notifications are off',result.reason);return}setPreferences(current=>current?{...current,push_enabled:true}:current)}

  return <Screen>
    <PageHeader title="Settings" eyebrow="Notifications & privacy"/>
    <View style={styles.hero}><View style={styles.heroIcon}><Ionicons name="notifications" size={24} color="white"/></View><View style={styles.heroCopy}><Text style={styles.heroTitle}>Stay close to what matters.</Text><Text style={styles.heroText}>Choose how GWMB reminds you about events, opportunities and your progress.</Text></View></View>
    <Text style={styles.section}>Delivery</Text>
    <View style={styles.card}>
      <PreferenceRow icon="phone-portrait-outline" label="Android push notifications" detail={Platform.OS==='web'?'Enable this inside the installed app.':'Alerts can appear even when GWMB is closed.'} value={preferences.push_enabled} disabled={saving} onChange={togglePush}/>
      <PreferenceRow icon="mail-outline" label="Email notifications" detail="Confirmations and important reminders." value={preferences.email_enabled} disabled={saving} onChange={value=>void save({email_enabled:value})}/>
    </View>
    <View style={styles.channelNote}><Ionicons name="chatbubbles-outline" size={19} color={colors.pinkDeep}/><Text style={styles.channelText}>SMS and WhatsApp delivery can be switched on after GWMB connects its messaging provider. Your preferences are already prepared for them.</Text></View>
    <Text style={styles.section}>What you hear about</Text>
    <View style={styles.card}>{categoryRows.map(([key,label,icon])=><PreferenceRow key={key} icon={icon} label={label} value={preferences[key]} disabled={saving} onChange={value=>void save({[key]:value})}/>)}</View>
    <Text style={styles.section}>Event reminder timing</Text>
    <View style={styles.card}>{timingRows.map(([key,label])=><PreferenceRow key={key} icon="alarm-outline" label={label} value={preferences[key]} disabled={saving||!preferences.events_enabled} onChange={value=>void save({[key]:value})}/>)}</View>
    <Text style={styles.section}>Privacy & security</Text>
    <View style={styles.info}><Ionicons name="shield-checkmark-outline" size={22} color={colors.pinkDeep}/><View style={styles.infoCopyWrap}><Text style={styles.infoTitle}>You are in control</Text><Text style={styles.infoCopy}>You can change these choices at any time. GWMB only stores the device token required to deliver your alerts.</Text></View></View>
    <View style={styles.card}>
      <SettingsLink icon="shield-checkmark-outline" label="Privacy Centre" detail="Data requests, policies and account deletion" onPress={()=>router.push('/privacy-center')}/>
      <SettingsLink icon="help-buoy-outline" label="Help & Support" detail="Get help, report a problem or share feedback" onPress={()=>router.push('/support')}/>
    </View>
  </Screen>;
}

function PreferenceRow({icon,label,detail,value,disabled,onChange}:{icon:React.ComponentProps<typeof Ionicons>['name'];label:string;detail?:string;value:boolean;disabled?:boolean;onChange:(value:boolean)=>void}){return <View style={styles.row}><View style={styles.icon}><Ionicons name={icon} size={18} color={colors.pinkDeep}/></View><View style={styles.rowCopy}><Text style={styles.label}>{label}</Text>{detail?<Text style={styles.detail}>{detail}</Text>:null}</View><Switch disabled={disabled} value={value} onValueChange={onChange} trackColor={{false:'#D8D4D6',true:colors.pink}} thumbColor="white"/></View>}
function SettingsLink({icon,label,detail,onPress}:{icon:React.ComponentProps<typeof Ionicons>['name'];label:string;detail:string;onPress:()=>void}){return <Pressable onPress={onPress} style={styles.row}><View style={styles.icon}><Ionicons name={icon} size={18} color={colors.pinkDeep}/></View><View style={styles.rowCopy}><Text style={styles.label}>{label}</Text><Text style={styles.detail}>{detail}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted}/></Pressable>}

const styles=StyleSheet.create({loading:{height:280,alignItems:'center',justifyContent:'center'},hero:{borderRadius:23,backgroundColor:colors.ink,padding:18,flexDirection:'row',alignItems:'center',gap:13},heroIcon:{width:48,height:48,borderRadius:16,backgroundColor:colors.pinkDeep,alignItems:'center',justifyContent:'center'},heroCopy:{flex:1},heroTitle:{color:'white',fontSize:16,fontFamily:fonts.headingBold},heroText:{color:'#D8D1D5',fontSize:10,lineHeight:15,fontFamily:fonts.body,marginTop:4},section:{color:colors.ink,fontSize:17,fontFamily:fonts.heading,marginTop:22,marginBottom:11},card:{borderRadius:21,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,overflow:'hidden'},row:{minHeight:67,paddingHorizontal:13,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.line},icon:{width:36,height:36,borderRadius:12,backgroundColor:colors.pinkSoft,alignItems:'center',justifyContent:'center'},rowCopy:{flex:1,minWidth:0,marginLeft:11,paddingVertical:10},label:{color:colors.ink,fontSize:11,fontFamily:fonts.bodyBold},detail:{color:colors.muted,fontSize:9,lineHeight:13,fontFamily:fonts.body,marginTop:2,paddingRight:6},channelNote:{borderRadius:17,backgroundColor:colors.pinkSoft,padding:13,flexDirection:'row',alignItems:'flex-start',gap:10,marginTop:10},channelText:{flex:1,color:colors.muted,fontSize:9,lineHeight:14,fontFamily:fonts.body},info:{borderRadius:19,backgroundColor:colors.pinkSoft,padding:16,flexDirection:'row',gap:11,marginBottom:20},infoCopyWrap:{flex:1},infoTitle:{color:colors.ink,fontSize:11,fontFamily:fonts.headingBold},infoCopy:{color:colors.muted,fontSize:9,lineHeight:14,fontFamily:fonts.body,marginTop:4}});
