import { access, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root=process.cwd();
const failures=[];
const read=path=>readFile(resolve(root,path),'utf8');
const requireText=async(path,needles)=>{const source=await read(path);for(const needle of needles)if(!source.includes(needle))failures.push(`${path} is missing flow connection: ${needle}`)};

await requireText('src/providers/FeatureFlagProvider.tsx',["enabled: false, beta_only: true","supabase.from('feature_flags')"]);
await requireText('src/lib/application-profile-store.ts',["from('application_profiles')","from('application_reminders')"]);
await requireText('src/lib/clique-store.ts',["from('clique_session_seats')"]);
await requireText('src/lib/opportunity-store.ts',["status:'draft' as const","loadAdminOpportunityApplications","updateOpportunityApplicationStatus"]);
await requireText('src/app/admin/index.tsx',["route:'/admin/applications'"]);
await requireText('src/app/admin/index.tsx',["route:'/admin/features'"]);
await requireText('src/app/privacy-center.tsx',["getAccountExportUrl"]);
await requireText('src/app/admin/operations.tsx',["processAccountRequest"]);
await requireText('src/components/PersonalizedHome.tsx',["mentorshipRegistrations","applications","registrations"]);
await requireText('src/components/LearnOverview.tsx',["loadEventRegistrations","loadMentorshipRegistrations"]);
await requireText('src/components/states/AppStateView.tsx',["'empty'","'error'","'offline'","'slow'","'no-results'","'session-expired'","'permission-denied'","'success'"]);
await requireText('src/providers/ConnectivityProvider.tsx',["useNetworkState","No internet"]);
await requireText('src/providers/AuthProvider.tsx',["sessionExpired","SIGNED_OUT"]);
await requireText('src/app/(tabs)/opportunities.tsx',["ScreenSkeleton","kind=\"no-results\"","useSlowLoading"]);
await requireText('src/lib/validation.ts',["required:","email:","url:","min:"]);

for(const path of ['src/app/admin/applications.tsx','src/app/admin/features.tsx','src/app/application-profile.tsx','src/app/cliques.tsx','src/app/attendance.tsx','src/app/privacy-center.tsx','src/components/states/Skeleton.tsx','src/providers/ConnectivityProvider.tsx','supabase/functions/account-request-process/index.ts']){
  try{await access(resolve(root,path))}catch{failures.push(`Missing flow destination: ${path}`)}
}

async function findDuplicateRoutes(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const path=join(directory,entry.name);
    if(entry.isDirectory())await findDuplicateRoutes(path);
    else if(/ \d+\.tsx$/.test(entry.name))failures.push(`Obsolete duplicate route: ${path.replace(`${root}/`,'')}`);
  }
}
await findDuplicateRoutes(resolve(root,'src/app'));

if(failures.length){console.error(`Flow readiness failed:\n- ${failures.join('\n- ')}`);process.exit(1)}
console.log('Flow readiness passed: guarded beta features, resilient loading/offline/session/form states, cloud-backed user journeys, cross-module Home/Learn connections and admin application handling are present.');
