-- Notes on habits: one private note per user habit (ideas, observations), never sent to the AI.

create type public.note_entity as enum ('principle', 'exercise', 'habit');

-- The entity trigger depends on the column: drop it around the type change
drop trigger notes_check_entity on public.notes;
alter table public.notes
  alter column entity_type type public.note_entity using entity_type::text::public.note_entity;

-- The principle or exercise must exist; the habit must belong to the note's author
create or replace function public.check_note_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.entity_type = 'principle'
      and not exists (select 1 from public.principles where id = new.entity_id))
     or (new.entity_type = 'exercise'
      and not exists (select 1 from public.exercises where id = new.entity_id))
     or (new.entity_type = 'habit'
      and not exists (
        select 1 from public.user_habits
        where id::text = new.entity_id and user_id = new.user_id
      )) then
    raise exception using errcode = '23503', message = 'note_entity_not_found';
  end if;
  return new;
end;
$$;
revoke all on function public.check_note_entity() from public, anon, authenticated;
create trigger notes_check_entity before insert or update of entity_type, entity_id on public.notes
  for each row execute function public.check_note_entity();

-- A deleted habit takes its note with it
create function public.delete_habit_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notes
  where user_id = old.user_id and entity_type = 'habit' and entity_id = old.id::text;
  return old;
end;
$$;
revoke all on function public.delete_habit_note() from public, anon, authenticated;
create trigger user_habits_delete_note after delete on public.user_habits
  for each row execute function public.delete_habit_note();
