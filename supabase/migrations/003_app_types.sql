-- App Types lookup table
create table if not exists public.app_types (
  id          text primary key,          -- e.g. "60", "60 + 63"
  name_en     text not null,
  name_ar     text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- updated_at trigger
create trigger set_app_types_updated_at
  before update on public.app_types
  for each row execute procedure public.set_updated_at();

-- RLS
alter table public.app_types enable row level security;

-- All authenticated users can read
create policy "app_types_read" on public.app_types
  for select using (auth.role() = 'authenticated');

-- Only authenticated users can write (you can tighten to admin role later)
create policy "app_types_write" on public.app_types
  for all using (auth.role() = 'authenticated');

-- Seed data from Setup App type.xlsx
insert into public.app_types (id, name_en, name_ar, sort_order) values
  ('60',        'Issue OutPass',                                          'إصدار تصريح مغادرة',                              1),
  ('107',       'Update Outpass',                                         'تعديل تصريح المغادرة',                             2),
  ('67',        'Extend Outpass',                                         'تمديد تصريح المغادرة',                             3),
  ('68',        'Cancel Outpass',                                         'إلغاء تصريح المغادرة',                             4),
  ('169',       'Issue Outpass without Violation Payment',                'اصدار تصريح مغادرة دون دفع الغرامة',               5),
  ('60 + 63',   'Bundle (Issue outpass + Lift Temp Closure with Absconding)', 'إصدار تصريح مغادرة',                           6),
  ('9',         'Cancel Before Entry',                                    'إلغاء قبل الدخول',                                 7),
  ('73',        'Lift Cancelled Permit Before Entry',                     'رفع إلغاء الإذن قبل الدخول',                      8),
  ('10',        'Cancel Visa After Entry',                                'إلغاء تأشيرة بعد الدخول',                          9),
  ('71',        'Lift Cancelled Permit After Entry',                      'حذف إلغاء الإذن بعد الدخول',                      10),
  ('30',        'Cancel Residence Inside UAE',                            'إلغاء إقامة داخل الدولة',                         11),
  ('69',        'Lift Cancel Residency Inside UAE',                       'إبطال إلغاء إقامة داخل دولة الإمارات',            12),
  ('23',        'Cancel Residence Outside UAE',                           'إلغاء إقامة خارج الدولة',                         13),
  ('70',        'Lift Cancel Residency Outside UAE',                      'إبطال إلغاء إقامة خارج دولة الإمارات',            14),
  ('175',       'Lift MoHRE Cancellation',                                'رفع إلغاء وزارة الموارد البشرية والتوطين',         15),
  ('61',        'Temporary Closure - With Absconding',                    'إغلاق مؤقت - هروب',                               16),
  ('62',        'Temporary Closure - Without Absconding',                 'إغلاق مؤقت - عدم وجود هروب',                      17),
  ('63',        'Lift Temporary Closure',                                  'رفع إغلاق مؤقت',                                  18),
  ('116',       'Update Temporary Closure',                               'تعديل إغلاق موقت',                                19),
  ('64',        'Permanent Closure',                                      'إغلاق دائم',                                      20),
  ('106',       'Lift Permanent Closure',                                  'رفع اغلاق دائم',                                  21),
  ('163',       'Issue Deportation Order',                                'إصدار أمر إخراج',                                  22),
  ('164',       'Cancel Deportation Order',                               'إلغاء أمر إخراج',                                  23),
  ('170',       'Violation Payment',                                      'دفع الغرامة',                                      24),
  ('171',       'Undo Violation Payment',                                 'التراجع عن دفع الغرامة',                           25),
  ('148',       'Violation Reduction - File Holder',                      'تخفيض غرامة - حامل ملف',                          26),
  ('149',       'Violation Reduction - New Born',                         'تخفيض غرامة - مولود جديد',                        27),
  ('17001',     'Violation Payment Fifty Top-up',                         '',                                                 28),
  ('172',       'Add Ban',                                                'إضافة حرمان',                                      29),
  ('173',       'Remove Ban',                                             'رفع حرمان',                                        30),
  ('174',       'Update Ban',                                             'تعديل حرمان',                                      31),
  ('176',       'Certificate of Entry/Exit',                              'شهادة دخول/خروج',                                  32),
  ('177',       'Sponsor and Sponsored Report',                           'تقرير الكفيل والمكفول',                            33),
  ('162',       'Family Hold',                                            'Family Hold',                                      34)
on conflict (id) do nothing;
