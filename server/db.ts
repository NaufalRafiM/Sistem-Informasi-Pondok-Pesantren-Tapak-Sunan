import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'tapak_sunan.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export type UserRole =
  | 'admin'
  | 'bendahara'
  | 'wali_santri'
  | 'wali_salaf'
  | 'wali_sekolah'
  | 'wali_kelas'
  | 'pembina_asrama';

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pondok_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      about TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      pengasuh TEXT NOT NULL,
      history_cikal_bakal TEXT NOT NULL DEFAULT '',
      history_pendirian TEXT NOT NULL DEFAULT '',
      history_arti_nama TEXT NOT NULL DEFAULT '',
      edu_jenjang TEXT NOT NULL DEFAULT '',
      edu_kurikulum TEXT NOT NULL DEFAULT '',
      edu_kegiatan TEXT NOT NULL DEFAULT '',
      spmb_info TEXT NOT NULL DEFAULT '',
      vision TEXT NOT NULL,
      mission TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      bank_account TEXT NOT NULL,
      bank_holder TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','bendahara','wali_santri','wali_salaf','wali_sekolah','wali_kelas','pembina_asrama')),
      phone TEXT NOT NULL DEFAULT '',
      avatar_file TEXT NOT NULL DEFAULT '',
      registration_note TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('salaf','sekolah')),
      level TEXT NOT NULL,
      wali_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      academic_year TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dorm_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      building TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 12,
      pembina_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      condition_note TEXT NOT NULL DEFAULT 'Baik & Bersih'
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nis TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('L','P')),
      birth_date TEXT NOT NULL,
      wali_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      salaf_class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      sekolah_class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
      dorm_room_id INTEGER REFERENCES dorm_rooms(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','lulus','cuti')),
      address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_walis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      wali_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(student_id, wali_user_id)
    );

    CREATE TABLE IF NOT EXISTS fee_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fee_type TEXT NOT NULL UNIQUE CHECK (fee_type IN ('spp','daftar_ulang')),
      title TEXT NOT NULL,
      amount INTEGER NOT NULL,
      academic_year TEXT NOT NULL,
      description TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      fee_type TEXT NOT NULL CHECK (fee_type IN ('spp','daftar_ulang')),
      period_month TEXT NOT NULL,
      title TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      paid_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'BELUM_BAYAR' CHECK (status IN ('BELUM_BAYAR','MENUNGGU_VERIFIKASI','SEBAGIAN','LUNAS')),
      due_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      wali_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      method TEXT NOT NULL CHECK (method IN ('transfer','tunai')),
      amount INTEGER NOT NULL,
      proof_file TEXT,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'MENUNGGU_VERIFIKASI' CHECK (status IN ('MENUNGGU_VERIFIKASI','DITERIMA','DITOLAK')),
      rejection_reason TEXT,
      receipt_no TEXT,
      verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cash_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('masuk','keluar')),
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount INTEGER NOT NULL,
      ref_payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
      attachment_file TEXT,
      recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      transaction_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      class_type TEXT NOT NULL CHECK (class_type IN ('salaf','sekolah')),
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('HADIR','IZIN','ALPHA','SAKIT')),
      complaint TEXT NOT NULL DEFAULT '',
      recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      UNIQUE(student_id, class_id, date)
    );

    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      class_type TEXT NOT NULL CHECK (class_type IN ('salaf','sekolah')),
      subject TEXT NOT NULL,
      semester TEXT NOT NULL,
      score INTEGER NOT NULL,
      predicate TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(student_id, class_id, subject, semester)
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      class_type TEXT NOT NULL CHECK (class_type IN ('salaf','sekolah')),
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      level TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('absensi_salaf','absensi_sekolah','pembina')),
      attendance_id INTEGER REFERENCES attendance(id) ON DELETE SET NULL,
      initial_complaint TEXT NOT NULL,
      disease_type TEXT NOT NULL DEFAULT '',
      severity TEXT CHECK (severity IN ('Ringan','Sedang','Berat') OR severity IS NULL),
      current_status TEXT NOT NULL DEFAULT 'Dilaporkan' CHECK (current_status IN ('Dilaporkan','Diperiksa','Istirahat/Obat','Dirujuk','Dijemput Wali','Sembuh')),
      reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      closed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES health_cases(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      action_note TEXT NOT NULL,
      medicine_note TEXT NOT NULL DEFAULT '',
      attachment_file TEXT,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dorm_conditions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      pembina_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      condition_status TEXT NOT NULL CHECK (condition_status IN ('Sehat','Perlu Perhatian','Sakit')),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('keuangan','kesehatan','akademik','umum')),
      ref_type TEXT,
      ref_id INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Migrate existing pondok_profile table columns if upgrading from older DB
  const existingCols = (db.prepare('PRAGMA table_info(pondok_profile)').all() as { name: string }[]).map((c) => c.name);
  const newCols = [
    'about',
    'history_cikal_bakal',
    'history_pendirian',
    'history_arti_nama',
    'edu_jenjang',
    'edu_kurikulum',
    'edu_kegiatan',
    'spmb_info',
  ];
  for (const col of newCols) {
    if (!existingCols.includes(col)) {
      db.exec(`ALTER TABLE pondok_profile ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
    }
  }

  // Migrate existing users table CHECK constraint to allow 'wali_kelas' and 'bendahara'
  const usersTable = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get() as { sql?: string } | undefined;
  if (usersTable?.sql && (!usersTable.sql.includes("'wali_kelas'") || !usersTable.sql.includes("'bendahara'"))) {
    const existingUserCols = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
    const hasAvatar = existingUserCols.includes('avatar_file');
    const hasRegNote = existingUserCols.includes('registration_note');
    db.pragma('foreign_keys = OFF');
    const migrateUsers = db.transaction(() => {
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin','bendahara','wali_santri','wali_salaf','wali_sekolah','wali_kelas','pembina_asrama')),
          phone TEXT NOT NULL DEFAULT '',
          avatar_file TEXT NOT NULL DEFAULT '',
          registration_note TEXT NOT NULL DEFAULT '',
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        );
        INSERT INTO users_new (id, username, email, password_hash, full_name, role, phone, avatar_file, registration_note, is_active, created_at)
        SELECT id, username, email, password_hash, full_name, role, phone, ${hasAvatar ? 'avatar_file' : "''"}, ${hasRegNote ? 'registration_note' : "''"}, is_active, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    });
    try {
      migrateUsers();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  const userCols = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
  if (!userCols.includes('registration_note')) {
    db.exec(`ALTER TABLE users ADD COLUMN registration_note TEXT NOT NULL DEFAULT ''`);
  }
  if (!userCols.includes('avatar_file')) {
    db.exec(`ALTER TABLE users ADD COLUMN avatar_file TEXT NOT NULL DEFAULT ''`);
  }

  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount === 0) {
    seedDatabase();
  } else {
    // Sync existing profile if still using initial placeholder address/pengasuh
    const row = db.prepare('SELECT address, about FROM pondok_profile WHERE id = 1').get() as
      | { address: string; about: string }
      | undefined;
    if (row && (!row.about || row.address.includes('Pondok Gede'))) {
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE pondok_profile SET
           tagline = ?, about = ?, address = ?, pengasuh = ?,
           history_cikal_bakal = ?, history_pendirian = ?, history_arti_nama = ?,
           edu_jenjang = ?, edu_kurikulum = ?, edu_kegiatan = ?, spmb_info = ?,
           vision = ?, mission = ?, updated_at = ?
         WHERE id = 1`
      ).run(
        'Pesantren Salafiyah Terpadu · Kajian Kitab Kuning & Pendidikan Umum (Condet, Jakarta Timur)',
        'Pondok Pesantren Tapak Sunan adalah lembaga pendidikan Islam berbasis pesantren salafiyah yang memadukan kajian kitab kuning dan pendidikan umum di kawasan Condet, Jakarta Timur. Pesantren ini didirikan oleh KH. Drs. Muhammad Nuruddin Munawar (lahir 1950) pada tahun 1990.',
        'Jl. Kayumanis Gang AMD 28 No. 39, RT 003/RW 005, Kelurahan Balekambang, Kecamatan Kramat Jati, Condet, Jakarta Timur',
        'KH. Drs. Muhammad Nuruddin Munawar (Pendiri, sejak 1990)',
        'Berawal dari kegiatan dakwah dan pengajian dari mushola ke mushola serta puluhan majelis taklim di wilayah Jabodetabek di bawah naungan Yayasan Ittihadul Anwar.',
        'Resmi berdiri sebagai pondok pesantren pada tahun 1990 di kawasan Condet. Sang pendiri berasal dari Cirebon dan memiliki keterkaitan keluarga dengan KH. Abdullah Abbas dari Pondok Pesantren Buntet, Cirebon.',
        'Nama "Tapak Sunan" merujuk pada jejak dakwah Sunan Gunung Jati yang dikaitkan dengan persinggahan di wilayah tersebut, serta saran dari Mbah Burhan (Demak).',
        'Menyelenggarakan pendidikan Salafiyah/Madrasah Islamiyah Salafiyah (MIS), Madrasah Tsanawiyah (MTs), dan Madrasah Aliyah (MA).',
        'Menekankan penguasaan kitab kuning (seperti nahwu, sarf, dan fikih), pembiasaan ubudiyah (salat berjamaah, tadarus, mujahadah), kemandirian, akhlakul karimah, serta moderasi beragama berhaluan Ahlusunnah wal Jamaah Nahdlatul Ulama.',
        'Selain mengaji dan musyawarah/diskusi kitab, santri juga dibekali kegiatan ekstrakurikuler seni dan budaya tradisional seperti tari daerah dan angklung.',
        'SPMB 2027/2028: Dibuka pada periode 13 Oktober 2026 – 2 April 2027.',
        'Mewujudkan lembaga pendidikan pesantren salafiyah yang unggul dalam penguasaan kitab kuning, berilmu pengetahuan umum, berakhlakul karimah, dan berhaluan Ahlusunnah wal Jamaah Nahdlatul Ulama.',
        '1. Menyelenggarakan pendidikan MIS (Salafiyah), MTs, dan MA secara terpadu.\n2. Membiasakan ubudiyah harian (salat berjamaah, tadarus, mujahadah) serta kemandirian santri.\n3. Mengembangkan musyawarah kitab kuning dan pelestarian seni budaya tradisional santri.',
        now
      );
    }

    // Sync existing sekolah classes so VII A & VII B through XII A & XII B are available
    const legacy7A = db
      .prepare("SELECT id FROM classes WHERE type = 'sekolah' AND name = 'VII-A SMP Tapak Sunan'")
      .get() as { id: number } | undefined;
    if (legacy7A) {
      db.prepare("UPDATE classes SET name = 'VII A (MTs)', level = 'MTs - Kelas VII' WHERE id = ?").run(legacy7A.id);
    }
    const legacy8B = db
      .prepare("SELECT id FROM classes WHERE type = 'sekolah' AND name = 'VIII-B SMP Tapak Sunan'")
      .get() as { id: number } | undefined;
    if (legacy8B) {
      db.prepare("UPDATE classes SET name = 'VIII B (MTs)', level = 'MTs - Kelas VIII' WHERE id = ?").run(legacy8B.id);
    }

    const sekolahSeedList: { name: string; level: string }[] = [
      { name: 'VII A (MTs)', level: 'MTs - Kelas VII' },
      { name: 'VII B (MTs)', level: 'MTs - Kelas VII' },
      { name: 'VIII A (MTs)', level: 'MTs - Kelas VIII' },
      { name: 'VIII B (MTs)', level: 'MTs - Kelas VIII' },
      { name: 'IX A (MTs)', level: 'MTs - Kelas IX' },
      { name: 'IX B (MTs)', level: 'MTs - Kelas IX' },
      { name: 'X A (MA)', level: 'MA - Kelas X' },
      { name: 'X B (MA)', level: 'MA - Kelas X' },
      { name: 'XI A (MA)', level: 'MA - Kelas XI' },
      { name: 'XI B (MA)', level: 'MA - Kelas XI' },
      { name: 'XII A (MA)', level: 'MA - Kelas XII' },
      { name: 'XII B (MA)', level: 'MA - Kelas XII' },
    ];
    const checkSekolah = db.prepare("SELECT id FROM classes WHERE type = 'sekolah' AND name = ?");
    const insertSekolah = db.prepare(
      "INSERT INTO classes (name, type, level, wali_user_id, academic_year) VALUES (?, 'sekolah', ?, NULL, '2026/2027')"
    );
    for (const cls of sekolahSeedList) {
      if (!checkSekolah.get(cls.name)) {
        insertSekolah.run(cls.name, cls.level);
      }
    }

    // Ensure dedicated Bendahara / TU demo account exists on existing databases
    const existingBendahara = db
      .prepare("SELECT id FROM users WHERE username = 'bendahara' OR role = 'bendahara'")
      .get();
    if (!existingBendahara) {
      const now = new Date().toISOString();
      const hash = bcrypt.hashSync('tapaksunan123', 10);
      db.prepare(
        `INSERT INTO users (username, email, password_hash, full_name, role, phone, is_active, created_at)
         VALUES ('bendahara', 'bendahara@tapaksunan.id', ?, 'Ibu Hj. Nurul Hidayah, S.E.', 'bendahara', '0812-8800-1002', 1, ?)`
      ).run(hash, now);
    }

    // One-time migration: activate any staff accounts that self-registered while pending approval was enabled
    const userVersion = db.pragma('user_version', { simple: true }) as number;
    if (userVersion < 1) {
      db.prepare("UPDATE users SET is_active = 1 WHERE is_active = 0 AND registration_note != ''").run();
      db.pragma('user_version = 1');
    }
  }

  // Ensure all primary wali_user_id links are mirrored in student_walis for multi-wali support
  db.exec(`
    INSERT OR IGNORE INTO student_walis (student_id, wali_user_id, created_at)
    SELECT id, wali_user_id, created_at FROM students WHERE wali_user_id IS NOT NULL;
  `);
}

function seedDatabase() {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const hash = bcrypt.hashSync('tapaksunan123', 10);

  db.prepare(`
    INSERT INTO pondok_profile (
      id, name, tagline, about, address, phone, email, pengasuh,
      history_cikal_bakal, history_pendirian, history_arti_nama,
      edu_jenjang, edu_kurikulum, edu_kegiatan, spmb_info,
      vision, mission, bank_name, bank_account, bank_holder, updated_at
    )
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Pondok Pesantren Tapak Sunan',
    'Pesantren Salafiyah Terpadu · Kajian Kitab Kuning & Pendidikan Umum (Condet, Jakarta Timur)',
    'Pondok Pesantren Tapak Sunan adalah lembaga pendidikan Islam berbasis pesantren salafiyah yang memadukan kajian kitab kuning dan pendidikan umum di kawasan Condet, Jakarta Timur. Pesantren ini didirikan oleh KH. Drs. Muhammad Nuruddin Munawar (lahir 1950) pada tahun 1990.',
    'Jl. Kayumanis Gang AMD 28 No. 39, RT 003/RW 005, Kelurahan Balekambang, Kecamatan Kramat Jati, Condet, Jakarta Timur',
    '(021) 809-xxxx',
    'sekretariat@tapaksunan.ponpes.id',
    'KH. Drs. Muhammad Nuruddin Munawar (Pendiri, sejak 1990)',
    'Berawal dari kegiatan dakwah dan pengajian dari mushola ke mushola serta puluhan majelis taklim di wilayah Jabodetabek di bawah naungan Yayasan Ittihadul Anwar.',
    'Resmi berdiri sebagai pondok pesantren pada tahun 1990 di kawasan Condet. Sang pendiri berasal dari Cirebon dan memiliki keterkaitan keluarga dengan KH. Abdullah Abbas dari Pondok Pesantren Buntet, Cirebon.',
    'Nama "Tapak Sunan" merujuk pada jejak dakwah Sunan Gunung Jati yang dikaitkan dengan persinggahan di wilayah tersebut, serta saran dari Mbah Burhan (Demak).',
    'Menyelenggarakan pendidikan Salafiyah/Madrasah Islamiyah Salafiyah (MIS), Madrasah Tsanawiyah (MTs), dan Madrasah Aliyah (MA).',
    'Menekankan penguasaan kitab kuning (seperti nahwu, sarf, dan fikih), pembiasaan ubudiyah (salat berjamaah, tadarus, mujahadah), kemandirian, akhlakul karimah, serta moderasi beragama berhaluan Ahlusunnah wal Jamaah Nahdlatul Ulama.',
    'Selain mengaji dan musyawarah/diskusi kitab, santri juga dibekali kegiatan ekstrakurikuler seni dan budaya tradisional seperti tari daerah dan angklung.',
    'SPMB 2027/2028: Dibuka pada periode 13 Oktober 2026 – 2 April 2027.',
    'Mewujudkan lembaga pendidikan pesantren salafiyah yang unggul dalam penguasaan kitab kuning, berilmu pengetahuan umum, berakhlakul karimah, dan berhaluan Ahlusunnah wal Jamaah Nahdlatul Ulama.',
    '1. Menyelenggarakan pendidikan MIS (Salafiyah), MTs, dan MA secara terpadu.\n2. Membiasakan ubudiyah harian (salat berjamaah, tadarus, mujahadah) serta kemandirian santri.\n3. Mengembangkan musyawarah kitab kuning dan pelestarian seni budaya tradisional santri.',
    'Bank Syariah Indonesia (BSI)',
    '7189-0045-2210',
    'Yayasan Ittihadul Anwar / Pondok Pesantren Tapak Sunan',
    now
  );

  // Seed 6 roles + extra wali santri
  const insertUser = db.prepare(`
    INSERT INTO users (username, email, password_hash, full_name, role, phone, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const adminId = insertUser.run('admin', 'admin@tapaksunan.id', hash, 'Ust. Ridwan Kamiluddin', 'admin', '0812-8800-1001', now).lastInsertRowid as number;
  insertUser.run('bendahara', 'bendahara@tapaksunan.id', hash, 'Ibu Hj. Nurul Hidayah, S.E.', 'bendahara', '0812-8800-1002', now);
  const waliSantriId = insertUser.run('wali.santri', 'hendrawan@gmail.com', hash, 'Bpk. Hendrawan Kusuma', 'wali_santri', '0813-4421-9002', now).lastInsertRowid as number;
  const waliSantri2Id = insertUser.run('wali.siti', 'siti.aminah@gmail.com', hash, 'Ibu Siti Aminah', 'wali_santri', '0815-7731-4510', now).lastInsertRowid as number;
  const waliSalafId = insertUser.run('wali.salaf', 'salaf@tapaksunan.id', hash, 'Ust. Muhammad Luthfi, Lc.', 'wali_salaf', '0812-9091-3344', now).lastInsertRowid as number;
  const waliSekolahId = insertUser.run('wali.sekolah', 'sekolah@tapaksunan.id', hash, 'Ibu Ratna Dewi, S.Pd.', 'wali_sekolah', '0813-6612-7788', now).lastInsertRowid as number;
  const pembinaId = insertUser.run('pembina', 'pembina@tapaksunan.id', hash, 'Ust. Fajar Shodiq', 'pembina_asrama', '0812-5501-8899', now).lastInsertRowid as number;

  // Classes (Salaf & Sekolah VII A - XII B)
  const insertClass = db.prepare(`
    INSERT INTO classes (name, type, level, wali_user_id, academic_year) VALUES (?, ?, ?, ?, ?)
  `);
  const salaf1Id = insertClass.run('Ula A - Safinatun Najah', 'salaf', 'Ula', waliSalafId, '2026/2027').lastInsertRowid as number;
  const salaf2Id = insertClass.run('Wustho B - Fathul Qorib', 'salaf', 'Wustho', waliSalafId, '2026/2027').lastInsertRowid as number;
  const sekolah1Id = insertClass.run('VII A (MTs)', 'sekolah', 'MTs - Kelas VII', waliSekolahId, '2026/2027').lastInsertRowid as number;
  insertClass.run('VII B (MTs)', 'sekolah', 'MTs - Kelas VII', null, '2026/2027');
  insertClass.run('VIII A (MTs)', 'sekolah', 'MTs - Kelas VIII', null, '2026/2027');
  const sekolah2Id = insertClass.run('VIII B (MTs)', 'sekolah', 'MTs - Kelas VIII', waliSekolahId, '2026/2027').lastInsertRowid as number;
  insertClass.run('IX A (MTs)', 'sekolah', 'MTs - Kelas IX', null, '2026/2027');
  insertClass.run('IX B (MTs)', 'sekolah', 'MTs - Kelas IX', null, '2026/2027');
  insertClass.run('X A (MA)', 'sekolah', 'MA - Kelas X', null, '2026/2027');
  insertClass.run('X B (MA)', 'sekolah', 'MA - Kelas X', null, '2026/2027');
  insertClass.run('XI A (MA)', 'sekolah', 'MA - Kelas XI', null, '2026/2027');
  insertClass.run('XI B (MA)', 'sekolah', 'MA - Kelas XI', null, '2026/2027');
  insertClass.run('XII A (MA)', 'sekolah', 'MA - Kelas XII', null, '2026/2027');
  insertClass.run('XII B (MA)', 'sekolah', 'MA - Kelas XII', null, '2026/2027');

  // Dorm rooms
  const insertDorm = db.prepare(`
    INSERT INTO dorm_rooms (name, building, capacity, pembina_user_id, condition_note) VALUES (?, ?, ?, ?, ?)
  `);
  const room1Id = insertDorm.run('Kamar Al-Ghazali 01', 'Gedung Putra Timur', 10, pembinaId, 'Bersih, ventilasi baik, P3K tersedia').lastInsertRowid as number;
  const room2Id = insertDorm.run('Kamar Al-Farabi 02', 'Gedung Putra Timur', 10, pembinaId, 'Kondisi baik, jadwal piket aktif').lastInsertRowid as number;
  const room3Id = insertDorm.run('Kamar Khadijah 01', 'Gedung Putri Barat', 10, pembinaId, 'Rapi dan nyaman').lastInsertRowid as number;

  // Students
  const insertStudent = db.prepare(`
    INSERT INTO students (nis, full_name, gender, birth_date, wali_user_id, salaf_class_id, sekolah_class_id, dorm_room_id, status, address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aktif', ?, ?)
  `);
  const s1 = insertStudent.run('TS-2026-001', 'Ahmad Fauzan Kusuma', 'L', '2013-04-12', waliSantriId, salaf1Id, sekolah1Id, room1Id, 'Bekasi Selatan, Jawa Barat', now).lastInsertRowid as number;
  const s2 = insertStudent.run('TS-2026-002', 'Zayd Al-Faruq Kusuma', 'L', '2012-08-21', waliSantriId, salaf2Id, sekolah2Id, room2Id, 'Bekasi Selatan, Jawa Barat', now).lastInsertRowid as number;
  const s3 = insertStudent.run('TS-2026-003', 'Nadia Zahra Putri', 'P', '2013-02-05', waliSantri2Id, salaf1Id, sekolah1Id, room3Id, 'Depok, Jawa Barat', now).lastInsertRowid as number;
  const s4 = insertStudent.run('TS-2026-004', 'Muhammad Ilham Akbar', 'L', '2013-11-18', waliSantri2Id, salaf1Id, sekolah1Id, room1Id, 'Jakarta Timur', now).lastInsertRowid as number;
  const s5 = insertStudent.run('TS-2026-005', 'Bagas Pratama Putra', 'L', '2012-06-30', waliSantriId, salaf2Id, sekolah2Id, room2Id, 'Bogor, Jawa Barat', now).lastInsertRowid as number;

  // Fee configs
  db.prepare(`
    INSERT INTO fee_configs (fee_type, title, amount, academic_year, description, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('spp', 'SPP Bulanan Santri Mukim', 650000, '2026/2027', 'Mencakup biaya pendidikan salaf, sekolah formal, makan 3x sehari, dan asrama.', now);

  db.prepare(`
    INSERT INTO fee_configs (fee_type, title, amount, academic_year, description, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('daftar_ulang', 'Biaya Daftar Ulang Tahunan', 1500000, '2026/2027', 'Mencakup kitab kurikulum tahun ajaran baru, seragam pesantren, dan pemeliharaan fasilitas.', now);

  // Bills
  const insertBill = db.prepare(`
    INSERT INTO bills (student_id, fee_type, period_month, title, total_amount, paid_amount, status, due_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const b1 = insertBill.run(s1, 'spp', '2026-10', 'SPP Oktober 2026', 650000, 650000, 'LUNAS', '2026-10-10', now).lastInsertRowid as number;
  const b2 = insertBill.run(s1, 'spp', '2026-11', 'SPP November 2026', 650000, 0, 'MENUNGGU_VERIFIKASI', '2026-11-10', now).lastInsertRowid as number;
  const b3 = insertBill.run(s2, 'spp', '2026-11', 'SPP November 2026', 650000, 0, 'BELUM_BAYAR', '2026-11-10', now).lastInsertRowid as number;
  const b4 = insertBill.run(s1, 'daftar_ulang', '2026-2027', 'Daftar Ulang TA 2026/2027', 1500000, 750000, 'SEBAGIAN', '2026-07-15', now).lastInsertRowid as number;
  const b5 = insertBill.run(s3, 'spp', '2026-11', 'SPP November 2026', 650000, 0, 'BELUM_BAYAR', '2026-11-10', now).lastInsertRowid as number;
  const b6 = insertBill.run(s4, 'spp', '2026-11', 'SPP November 2026', 650000, 650000, 'LUNAS', '2026-11-10', now).lastInsertRowid as number;

  // Payments
  const insertPayment = db.prepare(`
    INSERT INTO payments (bill_id, student_id, wali_user_id, method, amount, proof_file, notes, status, rejection_reason, receipt_no, verified_by, verified_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const p1 = insertPayment.run(b1, s1, waliSantriId, 'transfer', 650000, null, 'Transfer BSI a.n. Hendrawan', 'DITERIMA', null, 'KWT-TS-202610-001', adminId, now, now).lastInsertRowid as number;
  insertPayment.run(b2, s1, waliSantriId, 'transfer', 650000, null, 'Transfer SPP November 2026 untuk Ahmad Fauzan', 'MENUNGGU_VERIFIKASI', null, null, null, null, now);
  const p3 = insertPayment.run(b4, s1, waliSantriId, 'tunai', 750000, null, 'Cicilan pertama daftar ulang di kantor bendahara', 'DITERIMA', null, 'KWT-TS-202607-014', adminId, now, now).lastInsertRowid as number;
  const p4 = insertPayment.run(b6, s4, waliSantri2Id, 'transfer', 650000, null, 'Transfer SPP Ilham', 'DITERIMA', null, 'KWT-TS-202611-002', adminId, now, now).lastInsertRowid as number;
  insertPayment.run(b3, s2, waliSantriId, 'transfer', 650000, null, 'Lampiran buram sebelumnya', 'DITOLAK', 'Foto bukti transfer terpotong di bagian tanggal & nominal. Mohon unggah ulang foto yang jelas.', null, adminId, now, now);

  // Cash Ledger
  const insertCash = db.prepare(`
    INSERT INTO cash_ledger (type, category, description, amount, ref_payment_id, recorded_by, transaction_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCash.run('masuk', 'Pembayaran SPP', 'SPP Oktober 2026 - Ahmad Fauzan Kusuma (KWT-TS-202610-001)', 650000, p1, adminId, '2026-10-08', now);
  insertCash.run('masuk', 'Daftar Ulang', 'Daftar Ulang TA 2026/2027 - Ahmad Fauzan Kusuma (KWT-TS-202607-014)', 750000, p3, adminId, '2026-07-12', now);
  insertCash.run('masuk', 'Pembayaran SPP', 'SPP November 2026 - Muhammad Ilham Akbar (KWT-TS-202611-002)', 650000, p4, adminId, '2026-11-05', now);
  insertCash.run('keluar', 'Logistik Dapur', 'Belanja beras, lauk, dan kebutuhan konsumsi santri pekan 1', 1250000, null, adminId, '2026-11-06', now);
  insertCash.run('keluar', 'Kesehatan & UKP', 'Pengadaan obat-obatan P3K asrama dan vitamin santri', 320000, null, adminId, '2026-11-08', now);

  // Attendance
  const insertAtt = db.prepare(`
    INSERT INTO attendance (student_id, class_id, class_type, date, status, complaint, recorded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAtt.run(s1, salaf1Id, 'salaf', today, 'HADIR', '', waliSalafId, now);
  insertAtt.run(s3, salaf1Id, 'salaf', today, 'HADIR', '', waliSalafId, now);
  const attSickId = insertAtt.run(s4, salaf1Id, 'salaf', today, 'SAKIT', 'Demam tinggi sejak pagi dan mengeluh pusing saat mengaji sorogan', waliSalafId, now).lastInsertRowid as number;
  insertAtt.run(s1, sekolah1Id, 'sekolah', today, 'HADIR', '', waliSekolahId, now);
  insertAtt.run(s3, sekolah1Id, 'sekolah', today, 'IZIN', 'Izin menghadiri acara keluarga', waliSekolahId, now);

  // Grades
  const insertGrade = db.prepare(`
    INSERT INTO grades (student_id, class_id, class_type, subject, semester, score, predicate, notes, recorded_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertGrade.run(s1, salaf1Id, 'salaf', 'Fiqih (Safinatun Najah)', 'Ganjil 2026/2027', 91, 'A', 'Hafalan fashal thaharah dan shalat sangat lancar', waliSalafId, now);
  insertGrade.run(s1, salaf1Id, 'salaf', 'Nahwu (Jurumiyah)', 'Ganjil 2026/2027', 86, 'A', 'Pemahaman irob baik', waliSalafId, now);
  insertGrade.run(s2, salaf2Id, 'salaf', 'Fiqih (Fathul Qorib)', 'Ganjil 2026/2027', 84, 'B+', 'Aktif dalam bahtsul masail kelas', waliSalafId, now);
  insertGrade.run(s1, sekolah1Id, 'sekolah', 'Matematika', 'Ganjil 2026/2027', 88, 'A', 'Teliti dalam latihan soal', waliSekolahId, now);
  insertGrade.run(s1, sekolah1Id, 'sekolah', 'Bahasa Arab', 'Ganjil 2026/2027', 93, 'A', 'Nilai tertinggi di kelas VII-A', waliSekolahId, now);
  insertGrade.run(s2, sekolah2Id, 'sekolah', 'IPA Terpadu', 'Ganjil 2026/2027', 85, 'B+', 'Praktikum sangat baik', waliSekolahId, now);

  // Achievements
  const insertAch = db.prepare(`
    INSERT INTO achievements (student_id, class_type, title, category, level, date, notes, recorded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAch.run(s1, 'salaf', 'Juara 1 Musabaqah Qiraatil Kutub (MQK)', 'Kitab Kuning', 'Kabupaten', '2026-10-18', 'Mewakili Pondok Pesantren Tapak Sunan tingkat Kabupaten Bekasi', waliSalafId, now);
  insertAch.run(s2, 'sekolah', 'Juara 2 Olimpiade Sains Madrasah (Matematika)', 'Akademik', 'Kota/Kabupaten', '2026-09-25', 'Meraih medali perak bidang Matematika SMP', waliSekolahId, now);

  // Health Cases (1 from absensi_salaf needing triage, 1 active in Istirahat/Obat, 1 closed Sembuh)
  const insertHealth = db.prepare(`
    INSERT INTO health_cases (student_id, source, attendance_id, initial_complaint, disease_type, severity, current_status, reported_by, handled_by, closed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const hc1 = insertHealth.run(s4, 'absensi_salaf', attSickId, 'Demam tinggi sejak pagi dan mengeluh pusing saat mengaji sorogan', '', null, 'Dilaporkan', waliSalafId, null, null, now, now).lastInsertRowid as number;
  const hc2 = insertHealth.run(s2, 'pembina', null, 'Batuk kering dan radang tenggorokan setelah kegiatan luar', 'ISPA Ringan / Radang Tenggorokan', 'Ringan', 'Istirahat/Obat', pembinaId, pembinaId, null, now, now).lastInsertRowid as number;
  const hc3 = insertHealth.run(s1, 'absensi_sekolah', null, 'Nyeri perut akibat telat sarapan', 'Gastritis Ringan', 'Ringan', 'Sembuh', waliSekolahId, pembinaId, '2026-10-15T16:00:00.000Z', '2026-10-14T08:30:00.000Z', '2026-10-15T16:00:00.000Z').lastInsertRowid as number;

  const insertTimeline = db.prepare(`
    INSERT INTO health_timeline (case_id, status, action_note, medicine_note, updated_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertTimeline.run(hc1, 'Dilaporkan', 'Dilaporkan oleh Wali Kelas Salaf melalui absensi kelas Ula A.', '', waliSalafId, now);

  insertTimeline.run(hc2, 'Dilaporkan', 'Pembina asrama mencatat keluhan batuk di Kamar Al-Farabi 02.', '', pembinaId, now);
  insertTimeline.run(hc2, 'Diperiksa', 'Suhu tubuh 37.4°C, tenggorokan agak kemerahan. Dilakukan pemeriksaan awal di UKP Pondok.', 'Pengecekan suhu & tensi', pembinaId, now);
  insertTimeline.run(hc2, 'Istirahat/Obat', 'Santri beristirahat di ruang UKP dengan konsumsi air hangat dan bubur.', 'Paracetamol 500mg, OBH Herbal 3x1 sdm', pembinaId, now);

  insertTimeline.run(hc3, 'Dilaporkan', 'Dilaporkan sakit perut saat jam pelajaran sekolah.', '', waliSekolahId, '2026-10-14T08:30:00.000Z');
  insertTimeline.run(hc3, 'Istirahat/Obat', 'Diberikan obat maag sirup dan istirahat di asrama.', 'Antasida Doen 3x1', pembinaId, '2026-10-14T10:00:00.000Z');
  insertTimeline.run(hc3, 'Sembuh', 'Kondisi pulih sepenuhnya, santri kembali mengikuti kegiatan belajar.', 'Selesai pengobatan', pembinaId, '2026-10-15T16:00:00.000Z');

  // Dorm Conditions
  const insertDormCond = db.prepare(`
    INSERT INTO dorm_conditions (student_id, pembina_user_id, date, condition_status, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertDormCond.run(s1, pembinaId, today, 'Sehat', 'Aktif shalat berjamaah subuh dan piket kamar tepat waktu', now);
  insertDormCond.run(s2, pembinaId, today, 'Perlu Perhatian', 'Sedang dalam pemulihan batuk di ruang UKP', now);
  insertDormCond.run(s4, pembinaId, today, 'Sakit', 'Menunggu tindak lanjut laporan sakit dari kelas Salaf', now);

  // Notifications
  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, title, message, category, ref_type, ref_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `);
  insertNotif.run(waliSantriId, 'Tagihan SPP November 2026 Terbit', 'Tagihan SPP November 2026 sebesar Rp 650.000 untuk Zayd Al-Faruq Kusuma telah diterbitkan.', 'keuangan', 'bill', b3, now);
  insertNotif.run(waliSantriId, 'Pembayaran Ditolak - Zayd Al-Faruq', 'Bukti transfer SPP November 2026 ditolak: Foto bukti transfer terpotong di bagian tanggal & nominal. Mohon unggah ulang foto yang jelas.', 'keuangan', 'bill', b3, now);
  insertNotif.run(waliSantriId, 'Update Kesehatan: Zayd Al-Faruq Kusuma', 'Status penanganan kesehatan diperbarui ke "Istirahat/Obat". Tindakan: Santri beristirahat di ruang UKP dengan konsumsi air hangat dan bubur.', 'kesehatan', 'health_case', hc2, now);
  insertNotif.run(waliSantri2Id, 'Laporan Sakit Baru: Muhammad Ilham Akbar', 'Wali Kelas Salaf melaporkan Muhammad Ilham Akbar berstatus SAKIT: Demam tinggi sejak pagi dan mengeluh pusing saat mengaji sorogan.', 'kesehatan', 'health_case', hc1, now);
  insertNotif.run(pembinaId, 'Kasus Sakit Baru dari Absensi Salaf', 'Muhammad Ilham Akbar dilaporkan SAKIT dari kelas Ula A dan masuk daftar Perlu Ditindaklanjuti.', 'kesehatan', 'health_case', hc1, now);
  insertNotif.run(adminId, 'Bukti Pembayaran Menunggu Verifikasi', 'Wali santri Bpk. Hendrawan Kusuma mengunggah bukti transfer SPP November 2026 untuk Ahmad Fauzan Kusuma.', 'keuangan', 'payment', 2, now);

  // Audit Log
  db.prepare(`
    INSERT INTO audit_logs (user_id, user_name, user_role, action, module, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(adminId, 'Ust. Ridwan Kamiluddin', 'admin', 'INIT_SYSTEM', 'Sistem', 'Inisialisasi basis data Sistem Informasi Pondok Pesantren Tapak Sunan', now);
}
