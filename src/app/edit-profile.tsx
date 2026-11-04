import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthField } from '@/components/AuthField';
import { PageHeader } from '@/components/PageHeader';
import { Screen } from '@/components/Screen';
import { updateProfile, uploadAvatar } from '@/lib/account';
import { goBackOr } from '@/lib/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts } from '@/theme';

type SelectedPhoto = { uri: string; mimeType?: string | null };

export default function EditProfile() {
  const { user, profile, refreshAccount } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [city, setCity] = useState(profile?.city_club ?? '');
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const initials = (name || user?.email || 'GW').split(/[ @]/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const avatarUri = photo?.uri ?? profile?.avatar_url;

  async function choosePhoto() {
    setMessage(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.75 });
    if (!result.canceled && result.assets[0]) setPhoto({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType });
  }

  async function save() {
    setMessage(null);
    if (!user) { router.replace('/sign-in'); return; }
    if (name.trim().length < 2) { setMessage('Enter your full name.'); return; }
    setSaving(true);
    try {
      const avatarUrl = photo ? await uploadAvatar(user.id, photo.uri, photo.mimeType) : profile?.avatar_url ?? null;
      await updateProfile(user.id, { full_name: name.trim(), city_club: city.trim() || null, avatar_url: avatarUrl });
      await refreshAccount();
      goBackOr('/profile');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'We could not save your profile. Try again.');
    } finally { setSaving(false); }
  }

  if (!user) return <Screen><PageHeader title="Edit profile"/><View style={styles.message}><Text style={styles.messageText}>Sign in to update your profile.</Text></View><Pressable onPress={() => router.replace('/sign-in')} style={styles.cta}><Text style={styles.ctaText}>Sign in</Text></Pressable></Screen>;

  return <Screen><PageHeader title="Edit profile"/><View style={styles.photoSection}><View style={styles.avatar}>{avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatarImage}/> : <Text style={styles.initials}>{initials}</Text>}</View><Pressable onPress={choosePhoto} style={styles.photoButton}><Ionicons name="camera-outline" size={17} color={colors.pinkDeep}/><Text style={styles.photoButtonText}>{avatarUri ? 'Change profile photo' : 'Add profile photo'}</Text></Pressable><Text style={styles.photoNote}>JPG, PNG or WebP · Maximum 5 MB</Text></View><View style={styles.form}><AuthField label="Full name" value={name} onChangeText={setName} placeholder="Your full name" autoCapitalize="words"/><AuthField label="Email address" value={user.email ?? ''} editable={false}/><AuthField label="City Club" value={city} onChangeText={setCity} placeholder="e.g. Lagos City Club" autoCapitalize="words"/></View>{message ? <View style={styles.message}><Ionicons name="alert-circle-outline" size={17} color="#A41449"/><Text style={styles.messageText}>{message}</Text></View> : null}<Pressable disabled={saving} onPress={save} style={[styles.cta, saving && styles.disabled]}>{saving ? <ActivityIndicator color="white"/> : <Text style={styles.ctaText}>Save changes</Text>}</Pressable></Screen>;
}

const styles = StyleSheet.create({photoSection:{alignItems:'center',paddingVertical:12,marginBottom:13},avatar:{width:92,height:92,borderRadius:46,backgroundColor:colors.ink,alignItems:'center',justifyContent:'center',overflow:'hidden'},avatarImage:{width:'100%',height:'100%'},initials:{color:'white',fontSize:25,fontFamily:fonts.heading},photoButton:{minHeight:40,borderRadius:13,backgroundColor:colors.pinkSoft,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:7,marginTop:12},photoButtonText:{color:colors.pinkDeep,fontSize:10,fontFamily:fonts.bodyBold},photoNote:{color:colors.muted,fontSize:9,fontFamily:fonts.body,marginTop:7},form:{borderRadius:21,borderWidth:1,borderColor:colors.line,backgroundColor:colors.surface,padding:15},message:{borderRadius:14,backgroundColor:'#FFF0F3',padding:12,flexDirection:'row',gap:8,alignItems:'center',marginTop:12},messageText:{color:'#A41449',fontSize:9,lineHeight:14,fontFamily:fonts.bodyMedium,flex:1},cta:{height:52,borderRadius:16,backgroundColor:colors.pinkDeep,alignItems:'center',justifyContent:'center',marginTop:14},disabled:{opacity:.65},ctaText:{color:'white',fontSize:12,fontFamily:fonts.bodyBold}});
