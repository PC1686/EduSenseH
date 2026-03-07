import { supabase } from './src/lib/supabase.js'; supabase.from('doubts').select('*').limit(1).then(r => console.log(JSON.stringify(r.data)));
