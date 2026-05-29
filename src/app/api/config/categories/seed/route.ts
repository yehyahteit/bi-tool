import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const APP_TYPE_COLUMNS = [
  { key: 'id',      label: 'ID',              type: 'text',          required: true  },
  { key: 'name_en', label: 'English Name',    type: 'text',          required: true  },
  { key: 'name_ar', label: 'Arabic Name',     type: 'text_rtl',      required: false },
];

const APP_TYPE_ENTRIES = [
  { id: '60',      name_en: 'Issue OutPass',                                           name_ar: 'إصدار تصريح مغادرة' },
  { id: '107',     name_en: 'Update Outpass',                                          name_ar: 'تعديل تصريح المغادرة' },
  { id: '67',      name_en: 'Extend Outpass',                                          name_ar: 'تمديد تصريح المغادرة' },
  { id: '68',      name_en: 'Cancel Outpass',                                          name_ar: 'إلغاء تصريح المغادرة' },
  { id: '169',     name_en: 'Issue Outpass without Violation Payment',                 name_ar: 'اصدار تصريح مغادرة دون دفع الغرامة' },
  { id: '60 + 63', name_en: 'Bundle (Issue outpass + Lift Temp Closure with Absconding)', name_ar: 'إصدار تصريح مغادرة' },
  { id: '9',       name_en: 'Cancel Before Entry',                                    name_ar: 'إلغاء قبل الدخول' },
  { id: '73',      name_en: 'Lift Cancelled Permit Before Entry',                     name_ar: 'رفع إلغاء الإذن قبل الدخول' },
  { id: '10',      name_en: 'Cancel Visa After Entry',                                name_ar: 'إلغاء تأشيرة بعد الدخول' },
  { id: '71',      name_en: 'Lift Cancelled Permit After Entry',                      name_ar: 'حذف إلغاء الإذن بعد الدخول' },
  { id: '30',      name_en: 'Cancel Residence Inside UAE',                            name_ar: 'إلغاء إقامة داخل الدولة' },
  { id: '69',      name_en: 'Lift Cancel Residency Inside UAE',                       name_ar: 'إبطال إلغاء إقامة داخل دولة الإمارات' },
  { id: '23',      name_en: 'Cancel Residence Outside UAE',                           name_ar: 'إلغاء إقامة خارج الدولة' },
  { id: '70',      name_en: 'Lift Cancel Residency Outside UAE',                      name_ar: 'إبطال إلغاء إقامة خارج دولة الإمارات' },
  { id: '175',     name_en: 'Lift MoHRE Cancellation',                               name_ar: 'رفع إلغاء وزارة الموارد البشرية والتوطين' },
  { id: '61',      name_en: 'Temporary Closure - With Absconding',                   name_ar: 'إغلاق مؤقت - هروب' },
  { id: '62',      name_en: 'Temporary Closure - Without Absconding',                name_ar: 'إغلاق مؤقت - عدم وجود هروب' },
  { id: '63',      name_en: 'Lift Temporary Closure',                                name_ar: 'رفع إغلاق مؤقت' },
  { id: '116',     name_en: 'Update Temporary Closure',                              name_ar: 'تعديل إغلاق موقت' },
  { id: '64',      name_en: 'Permanent Closure',                                     name_ar: 'إغلاق دائم' },
  { id: '106',     name_en: 'Lift Permanent Closure',                                name_ar: 'رفع اغلاق دائم' },
  { id: '163',     name_en: 'Issue Deportation Order',                               name_ar: 'إصدار أمر إخراج' },
  { id: '164',     name_en: 'Cancel Deportation Order',                              name_ar: 'إلغاء أمر إخراج' },
  { id: '170',     name_en: 'Violation Payment',                                     name_ar: 'دفع الغرامة' },
  { id: '171',     name_en: 'Undo Violation Payment',                                name_ar: 'التراجع عن دفع الغرامة' },
  { id: '148',     name_en: 'Violation Reduction - File Holder',                     name_ar: 'تخفيض غرامة - حامل ملف' },
  { id: '149',     name_en: 'Violation Reduction - New Born',                        name_ar: 'تخفيض غرامة - مولود جديد' },
  { id: '17001',   name_en: 'Violation Payment Fifty Top-up',                        name_ar: '' },
  { id: '172',     name_en: 'Add Ban',                                               name_ar: 'إضافة حرمان' },
  { id: '173',     name_en: 'Remove Ban',                                            name_ar: 'رفع حرمان' },
  { id: '174',     name_en: 'Update Ban',                                            name_ar: 'تعديل حرمان' },
  { id: '176',     name_en: 'Certificate of Entry/Exit',                             name_ar: 'شهادة دخول/خروج' },
  { id: '177',     name_en: 'Sponsor and Sponsored Report',                          name_ar: 'تقرير الكفيل والمكفول' },
  { id: '162',     name_en: 'Family Hold',                                           name_ar: 'Family Hold' },
];

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check if already seeded
  const { data: existing } = await supabase
    .from('config_categories')
    .select('id')
    .eq('user_id', user.id)
    .eq('slug', 'application-types')
    .single();

  if (existing) return NextResponse.json({ message: 'Already seeded', id: existing.id });

  // Create the category
  const { data: cat, error: catErr } = await supabase
    .from('config_categories')
    .insert({
      user_id: user.id,
      name: 'Application Types',
      description: 'Application type IDs with English and Arabic names',
      slug: 'application-types',
      columns: APP_TYPE_COLUMNS,
      sort_order: 1,
    })
    .select()
    .single();

  if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });

  // Bulk insert entries
  const entries = APP_TYPE_ENTRIES.map((e, i) => ({
    category_id: cat.id,
    user_id: user.id,
    data: e,
    is_active: true,
    sort_order: i + 1,
  }));

  const { error: entErr } = await supabase.from('config_entries').insert(entries);
  if (entErr) return NextResponse.json({ error: entErr.message }, { status: 500 });

  return NextResponse.json({ message: 'Seeded', id: cat.id }, { status: 201 });
}
