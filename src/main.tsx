import ProgramLauncher from './program-launcher';
import {lazy,memo,Suspense,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {Session} from '@supabase/supabase-js';
import {supabase} from './backend';
import './style.css';
const MoneyApp=memo(lazy(()=>import('./MoneyApp')));
function App(){const[session,SessionState]=useState<Session|null>(null),[loading,Loading]=useState(true),[error,ErrorText]=useState('');
 useEffect(()=>{if(!supabase){ErrorText('ระบบยังตั้งค่าไม่ครบ');Loading(false);return}if(location.hash.includes('access_token=')){location.replace('/login'+location.hash);return}let alive=true;supabase.auth.getSession().then(({data,error})=>{if(!alive)return;if(error){ErrorText('ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองใหม่');Loading(false);return}SessionState(data.session);Loading(false);if(!data.session?.user.email_confirmed_at)location.replace('/login')});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{if(!alive)return;SessionState(next);if(!next)location.replace('/login')});return()=>{alive=false;subscription.unsubscribe()}},[]);
 if(error)return <main className="auth-loading" role="alert">{error}<a href="/login">เข้าสู่ระบบอีกครั้ง</a></main>;
 if(loading||!session?.user.email_confirmed_at)return <main className="auth-loading" role="status">กำลังตรวจสอบการเข้าสู่ระบบ…</main>;
 return <Suspense fallback={<main className="auth-loading" role="status">กำลังเปิดระบบบัญชี…</main>}><MoneyApp key={session.user.id}/></Suspense>;
}
createRoot(document.getElementById('root')!).render(<><App/><ProgramLauncher current='bill'/></>);
