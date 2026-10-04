import type {} from './startup';
const boot=window.axiomStartup;
try {
 boot.assertAlive();
 if(boot.test==='module-fail')throw Error('Simulated game module import failure');
 if(boot.test==='timeout')await boot.run('test','Simulated non-completing stage',()=>new Promise(()=>{}),2000);
 await import('./main');
} catch(error) { boot.fail('Game module loading / evaluation',error); }
