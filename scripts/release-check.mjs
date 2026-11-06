import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root=process.cwd();
const requiredRoutes=[
  'src/app/(auth)/sign-up.tsx','src/app/(auth)/sign-in.tsx','src/app/verify-membership.tsx',
  'src/app/(tabs)/learn.tsx','src/app/(tabs)/mentorship.tsx','src/app/(tabs)/opportunities.tsx','src/app/(tabs)/community.tsx',
  'src/app/privacy-center.tsx','src/app/support.tsx','src/app/admin/operations.tsx','src/app/attendance.tsx','src/app/chapter-admin.tsx',
];
const requiredOperationalFiles=['src/providers/FeatureFlagProvider.tsx','src/components/FeatureAccessGate.tsx','src/components/AppErrorBoundary.tsx'];
const requiredMigrations=[
  '202610200004_live_attendance_participation.sql',
  '202610200005_launch_readiness.sql',
  '202610210001_release_flow_completion.sql',
  '202610290001_release_blocker_security_and_registration.sql',
  '202610290004_critical_application_event_integrity.sql',
  '202610290006_high_priority_release_integrity.sql',
  '202611040001_content_publication_readiness.sql',
];
const failures=[];
for(const file of requiredRoutes){try{await access(resolve(root,file))}catch{failures.push(`Missing critical route: ${file}`)}}
for(const file of requiredOperationalFiles){try{await access(resolve(root,file))}catch{failures.push(`Missing operational control: ${file}`)}}
for(const file of requiredMigrations){try{await access(resolve(root,'supabase/migrations',file))}catch{failures.push(`Missing migration: ${file}`)}}
const app=JSON.parse(await readFile(resolve(root,'app.json'),'utf8')).expo;
const eas=JSON.parse(await readFile(resolve(root,'eas.json'),'utf8'));
for(const [name,value] of [['app name',app.name],['slug',app.slug],['scheme',app.scheme],['iOS bundle identifier',app.ios?.bundleIdentifier],['Android package',app.android?.package],['EAS project ID',app.extra?.eas?.projectId]])if(!value)failures.push(`Missing ${name} in app.json`);
if(!app.plugins?.some(plugin=>Array.isArray(plugin)?plugin[0]==='expo-notifications':plugin==='expo-notifications'))failures.push('expo-notifications is not configured');
if(app.ios?.infoPlist?.ITSAppUsesNonExemptEncryption!==false)failures.push('iOS export compliance declaration is missing');
if(eas.build?.preview?.distribution!=='internal'||eas.build?.preview?.android?.buildType!=='apk')failures.push('Preview build must produce an internally distributed Android APK');
if(eas.build?.['preview-simulator']?.ios?.simulator!==true)failures.push('iOS preview must target the simulator');
if(eas.build?.production?.android?.buildType!=='app-bundle')failures.push('Production Android build must produce an app bundle');
const env=await readFile(resolve(root,'.env.example'),'utf8');
for(const key of ['EXPO_PUBLIC_SUPABASE_URL','EXPO_PUBLIC_SUPABASE_ANON_KEY'])if(!env.includes(key))failures.push(`Missing ${key} from .env.example`);
if(failures.length){console.error(`Release readiness failed:\n- ${failures.join('\n- ')}`);process.exit(1)}
const contracts=spawnSync(process.execPath,['--test','tests/release-contracts.test.mjs'],{cwd:root,stdio:'inherit'});
if(contracts.status!==0){console.error('Release readiness failed: an internal release contract is broken.');process.exit(contracts.status??1)}
console.log(`Release readiness passed: ${requiredRoutes.length} critical routes, ${requiredOperationalFiles.length} operational controls, ${requiredMigrations.length} migrations, production app identifiers and internal release contracts are present.`);
