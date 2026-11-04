import { useEffect } from 'react';
import { Platform } from 'react-native';

import { logAppError } from '@/lib/launch-operations';

type NativeErrorHandler=(error:Error,isFatal?:boolean)=>void;
type NativeErrorUtils={getGlobalHandler:()=>NativeErrorHandler;setGlobalHandler:(handler:NativeErrorHandler)=>void};

export function OperationalErrorBridge(){
  useEffect(()=>{
    if(Platform.OS==='web'){
      const onError=(event:ErrorEvent)=>{void logAppError('web-global-error',event.error??event.message,{filename:event.filename,line:event.lineno,column:event.colno},'fatal')};
      const onRejection=(event:PromiseRejectionEvent)=>{void logAppError('unhandled-promise-rejection',event.reason,{},'error')};
      window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onRejection);
      return()=>{window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onRejection)};
    }
    const errorUtils=(globalThis as typeof globalThis&{ErrorUtils?:NativeErrorUtils}).ErrorUtils;if(!errorUtils)return;
    const previous=errorUtils.getGlobalHandler();
    const handler:NativeErrorHandler=(error,isFatal)=>{void logAppError('native-js-global-error',error,{isFatal:Boolean(isFatal)},isFatal?'fatal':'error');previous(error,isFatal)};
    errorUtils.setGlobalHandler(handler);
    return()=>errorUtils.setGlobalHandler(previous);
  },[]);
  return null;
}
