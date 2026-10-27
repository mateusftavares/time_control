/* Valores públicos por design: a anon/publishable key só dá o que a RLS permite.
   Troque pelos do seu projeto (Supabase → Project Settings → API). A service role NUNCA vem aqui. */
export const SUPABASE_URL = 'https://mxxphaykywrklezoyorq.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14eHBoYXlreXdya2xlem95b3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMjcxMDIsImV4cCI6MjEwODcwMzEwMn0.4rTLPmPL42sf9evrlaV3w8kFXGiOIwxZ2ohR7YlK6xI';

export const CONFIGURADO = !SUPABASE_URL.includes('SEU-PROJETO') && !SUPABASE_ANON_KEY.startsWith('SUA-CHAVE');
