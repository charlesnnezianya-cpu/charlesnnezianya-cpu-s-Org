-- Brainstine Supabase Schema & Safe Idempotent Migration (PostgreSQL + RLS + Storage)
-- Run this SQL script in your Supabase SQL Editor.
-- Safe to run on a fresh OR existing database: never drops tables or deletes existing user data.

create extension if not exists "pgcrypto";

-- 1. User Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  theme_preference text not null default 'system' check (theme_preference in ('light', 'dark', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, 'Student'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Study Materials
create table if not exists public.study_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  material_type text not null check (material_type in ('pdf', 'image', 'audio', 'text')),
  file_name text,
  file_size bigint,
  mime_type text,
  storage_path text,
  extracted_text text not null,
  word_count integer not null default 0,
  chunk_count integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists study_materials_user_id_idx
  on public.study_materials (user_id, created_at desc);

alter table public.study_materials enable row level security;

drop policy if exists "Users can view their own study materials" on public.study_materials;
create policy "Users can view their own study materials"
  on public.study_materials for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own study materials" on public.study_materials;
create policy "Users can insert their own study materials"
  on public.study_materials for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own study materials" on public.study_materials;
create policy "Users can delete their own study materials"
  on public.study_materials for delete
  using (auth.uid() = user_id);

-- 3. Study Summaries
create table if not exists public.study_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid references public.study_materials (id) on delete set null,
  title text not null,
  subject_area text not null default 'General Studies',
  summary_level text not null check (summary_level in ('short', 'detailed', 'comprehensive')),
  structured_content jsonb not null,
  markdown_content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_summaries_user_id_idx
  on public.study_summaries (user_id, created_at desc);

alter table public.study_summaries enable row level security;

drop policy if exists "Users can view their own summaries" on public.study_summaries;
create policy "Users can view their own summaries"
  on public.study_summaries for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own summaries" on public.study_summaries;
create policy "Users can insert their own summaries"
  on public.study_summaries for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own summaries" on public.study_summaries;
create policy "Users can update their own summaries"
  on public.study_summaries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own summaries" on public.study_summaries;
create policy "Users can delete their own summaries"
  on public.study_summaries for delete
  using (auth.uid() = user_id);

-- 4. Study Activities
create table if not exists public.study_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_type text not null check (activity_type in ('upload', 'extract', 'summarize', 'save', 'quiz', 'chat', 'tutor')),
  title text not null,
  detail text not null,
  material_type text not null check (material_type in ('pdf', 'image', 'audio', 'text')),
  summary_level text check (summary_level in ('short', 'detailed', 'comprehensive')),
  created_at timestamptz not null default now()
);

create index if not exists study_activities_user_id_idx
  on public.study_activities (user_id, created_at desc);

alter table public.study_activities enable row level security;

drop policy if exists "Users can view their own study activities" on public.study_activities;
create policy "Users can view their own study activities"
  on public.study_activities for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own study activities" on public.study_activities;
create policy "Users can insert their own study activities"
  on public.study_activities for insert
  with check (auth.uid() = user_id);

-- 5. Generated Quizzes & Examinations
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  subject_area text not null default 'General Studies',
  source_mode text not null check (source_mode in ('material', 'summary', 'text', 'topic')),
  material_id uuid references public.study_materials (id) on delete set null,
  summary_id uuid references public.study_summaries (id) on delete set null,
  format text not null check (format in ('objective', 'theory', 'mixed')),
  difficulty text not null check (difficulty in ('easy', 'intermediate', 'advanced', 'mixed')),
  question_count integer not null,
  time_limit_minutes integer,
  questions jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists quizzes_user_id_idx
  on public.quizzes (user_id, created_at desc);

alter table public.quizzes enable row level security;

drop policy if exists "Users can view their own quizzes" on public.quizzes;
create policy "Users can view their own quizzes"
  on public.quizzes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own quizzes" on public.quizzes;
create policy "Users can insert their own quizzes"
  on public.quizzes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own quizzes" on public.quizzes;
create policy "Users can delete their own quizzes"
  on public.quizzes for delete
  using (auth.uid() = user_id);

-- 6. Quiz & Exam Attempts
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  quiz_id uuid references public.quizzes (id) on delete set null,
  title text not null,
  format text not null check (format in ('objective', 'theory', 'mixed')),
  difficulty text not null check (difficulty in ('easy', 'intermediate', 'advanced', 'mixed')),
  total_questions integer not null,
  correct_count integer not null default 0,
  incorrect_count integer not null default 0,
  unanswered_count integer not null default 0,
  earned_marks numeric(8, 2) not null default 0,
  max_marks numeric(8, 2) not null default 0,
  percentage numeric(5, 2) not null default 0,
  time_taken_seconds integer not null default 0,
  answers jsonb not null,
  graded_results jsonb not null,
  performance_summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists quiz_attempts_user_id_idx
  on public.quiz_attempts (user_id, created_at desc);

alter table public.quiz_attempts enable row level security;

drop policy if exists "Users can view their own quiz attempts" on public.quiz_attempts;
create policy "Users can view their own quiz attempts"
  on public.quiz_attempts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own quiz attempts" on public.quiz_attempts;
create policy "Users can insert their own quiz attempts"
  on public.quiz_attempts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own quiz attempts" on public.quiz_attempts;
create policy "Users can delete their own quiz attempts"
  on public.quiz_attempts for delete
  using (auth.uid() = user_id);

-- 7. AI Chat & AI Tutor Sessions
create table if not exists public.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_type text not null check (session_type in ('chat', 'tutor')),
  title text not null,
  subject_area text not null default 'General Studies',
  tutor_mode text check (tutor_mode in ('beginner', 'standard', 'advanced')),
  tutor_step integer not null default 1,
  tutor_stage_label text,
  attached_material_id uuid references public.study_materials (id) on delete set null,
  attached_summary_id uuid references public.study_summaries (id) on delete set null,
  active_image_path text,
  active_image_mime text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_sessions_user_type_idx
  on public.ai_sessions (user_id, session_type, updated_at desc);

alter table public.ai_sessions enable row level security;

drop policy if exists "Users can view their own AI sessions" on public.ai_sessions;
create policy "Users can view their own AI sessions"
  on public.ai_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own AI sessions" on public.ai_sessions;
create policy "Users can insert their own AI sessions"
  on public.ai_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own AI sessions" on public.ai_sessions;
create policy "Users can update their own AI sessions"
  on public.ai_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own AI sessions" on public.ai_sessions;
create policy "Users can delete their own AI sessions"
  on public.ai_sessions for delete
  using (auth.uid() = user_id);

-- 8. AI Chat & AI Tutor Messages
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  image_path text,
  image_mime text,
  action_tag text,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_session_idx
  on public.ai_messages (session_id, created_at asc);

alter table public.ai_messages enable row level security;

drop policy if exists "Users can view their own AI messages" on public.ai_messages;
create policy "Users can view their own AI messages"
  on public.ai_messages for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own AI messages" on public.ai_messages;
create policy "Users can insert their own AI messages"
  on public.ai_messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.ai_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their own AI messages" on public.ai_messages;
create policy "Users can delete their own AI messages"
  on public.ai_messages for delete
  using (auth.uid() = user_id);

-- 9. Storage Bucket for Uploaded Materials & Session Images
insert into storage.buckets (id, name, public)
values ('study-materials', 'study-materials', false)
on conflict (id) do nothing;

drop policy if exists "Users can upload their own material files" on storage.objects;
create policy "Users can upload their own material files"
  on storage.objects for insert
  with check (
    bucket_id = 'study-materials'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can view their own material files" on storage.objects;
create policy "Users can view their own material files"
  on storage.objects for select
  using (
    bucket_id = 'study-materials'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own material files" on storage.objects;
create policy "Users can delete their own material files"
  on storage.objects for delete
  using (
    bucket_id = 'study-materials'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
