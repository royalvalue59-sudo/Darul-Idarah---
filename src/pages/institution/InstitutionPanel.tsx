import React, { useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Banknote,
  Bell,
  BookMarked,
  BookOpen,
  Building,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  Clock,
  FileBarChart2,
  FolderKanban,
  FolderPlus,
  GraduationCap,
  Home,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MessageSquare,
  Scale,
  Settings,
  ShieldAlert,
  Tags,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { AppShell, type NavItem } from '../../components/layout/AppShell';
import { useApp } from '../../context/AppContext';
import { DashboardModule } from './modules/DashboardModule';
import {
  AdminDepartmentsModule,
  DesignationsModule,
  ProfileModule,
  SettingsModule,
} from './modules/ProfileAdminModule';
import { AcademicSetupModule } from './modules/AcademicSetupModule';
import { AcademicModule } from './modules/AcademicModule';
import { TeachersModule } from './modules/TeachersModule';
import { TeacherSalaryModule } from './modules/TeacherSalaryModule';
import { TeacherDuesModule } from './modules/TeacherDuesModule';
import { TeacherScheduleModule } from './modules/TeacherScheduleModule';
import { TeacherLiveStatusModule } from './modules/TeacherLiveStatusModule';
import { LeaveManagementModule } from './modules/LeaveManagementModule';
import { StudentsModule } from './modules/StudentsModule';
import { AttendanceModule } from './modules/AttendanceModule';
import { ExamsModule } from './modules/ExamsModule';
import { HostelModule, LibraryModule } from './modules/HostelLibraryModule';
import { FinanceModule } from './modules/FinanceModule';
import {
  InstitutionSupportModule,
  NoticesModule,
  ReportsModule,
} from './modules/NoticesSupportReportsModule';
import { InstitutionAuditLogsModule, MessagingModule } from './modules/AuditLogsMessagingModule';

type InstNavItem = Omit<NavItem, 'children'> & {
  permModule?: string;
  permAny?: string[];
  children?: InstNavItem[];
};

const ALL_INST_NAV: InstNavItem[] = [
  { id: 'dashboard', label: 'ড্যাশবোর্ড', icon: LayoutDashboard },
  { id: 'profile', label: 'প্রতিষ্ঠান প্রোফাইল', icon: Building2, permModule: 'profile' },
  { id: 'admin_departments', label: 'প্রশাসনিক বিভাগ', icon: Building, permModule: 'admin_departments' },
  { id: 'designations', label: 'পদবি', icon: UserCheck, permModule: 'designations' },
  {
    id: 'academic_setup',
    label: 'একাডেমিক সেটআপ',
    icon: FolderKanban,
    permModule: 'academic',
    children: [
      { id: 'setup_departments', label: 'বিভাগ এড', icon: FolderPlus, permModule: 'academic' },
      { id: 'setup_books', label: 'কিতাব / বই এড', icon: BookMarked, permModule: 'academic' },
      { id: 'setup_jamaats', label: 'শ্রেণী / জামাতের নাম', icon: Tags, permModule: 'academic' },
    ],
  },
  { id: 'academic', label: 'শ্রেণী ও রুটিন', icon: CalendarClock, permModule: 'academic' },
  {
    id: 'teacher_management',
    label: 'শিক্ষক ব্যবস্থাপনা',
    icon: Users,
    children: [
      { id: 'teachers', label: 'শিক্ষক তালিকা ও প্রোফাইল', icon: Users, permModule: 'teachers' },
      { id: 'teacher_salary', label: 'বেতন ও রসিদ', icon: Banknote, permModule: 'finance' },
      { id: 'teacher_dues', label: 'অতিরিক্ত উত্তোলন ও বকেয়া', icon: Scale, permModule: 'finance' },
      { id: 'teacher_schedules', label: 'ক্লাস শিডিউল ও বিরতি', icon: Clock, permModule: 'teachers' },
      { id: 'teacher_live', label: 'লাইভ স্ট্যাটাস', icon: Activity, permModule: 'teachers' },
    ],
  },
  { id: 'leaves', label: 'ছুটি ব্যবস্থাপনা', icon: CalendarOff, permAny: ['teachers', 'students', 'attendance'] },
  { id: 'students', label: 'শিক্ষার্থী', icon: GraduationCap, permModule: 'students' },
  { id: 'attendance', label: 'উপস্থিতি', icon: CalendarCheck, permModule: 'attendance' },
  { id: 'exams', label: 'পরীক্ষা ও ফলাফল', icon: Award, permModule: 'exams' },
  { id: 'hostel', label: 'দারুল একামা', icon: Home, permModule: 'hostel' },
  { id: 'library', label: 'লাইব্রেরি', icon: BookOpen, permModule: 'library' },
  { id: 'finance', label: 'হিসাব ও অর্থব্যবস্থা', icon: Wallet, permModule: 'finance' },
  { id: 'notices', label: 'নোটিশ বোর্ড', icon: Bell, permModule: 'notices' },
  { id: 'messaging', label: 'মেসেজিং', icon: MessageSquare },
  { id: 'reports', label: 'রিপোর্ট', icon: FileBarChart2, permModule: 'reports' },
  { id: 'audit_logs', label: 'অডিট লগ', icon: ShieldAlert, permAny: ['settings', 'reports'] },
  { id: 'support', label: 'সাপোর্ট সেন্টার', icon: LifeBuoy, permModule: 'support' },
  { id: 'settings', label: 'সেটিংস', icon: Settings, permModule: 'settings' },
  { id: 'logout', label: 'লগআউট', icon: LogOut },
];

export function InstitutionPanel() {
  const { hasPermission } = useApp();
  const [activeNav, setActiveNav] = useState('dashboard');

  const canSee = (item: InstNavItem) => {
    if (item.permModule && !hasPermission(item.permModule, 'view')) return false;
    if (item.permAny && !item.permAny.some((m) => hasPermission(m, 'view'))) return false;
    return true;
  };

  const visibleNav = useMemo(
    () =>
      ALL_INST_NAV.reduce<NavItem[]>((acc, item) => {
        if (!canSee(item)) return acc;
        if (item.children) {
          const allowedChildren = item.children.filter((c) => canSee(c));
          if (allowedChildren.length === 0) return acc;
          acc.push({ ...item, children: allowedChildren });
        } else {
          acc.push(item);
        }
        return acc;
      }, []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasPermission]
  );

  return (
    <AppShell
      brandSubtitle="মাদ্রাসা ব্যবস্থাপনা প্যানেল"
      navItems={visibleNav}
      activeNav={activeNav}
      onSelectNav={setActiveNav}
    >
      {activeNav === 'dashboard' && <DashboardModule onNavigate={setActiveNav} />}
      {activeNav === 'profile' && <ProfileModule />}
      {activeNav === 'admin_departments' && <AdminDepartmentsModule />}
      {activeNav === 'designations' && <DesignationsModule />}
      {activeNav === 'setup_departments' && <AcademicSetupModule section="departments" />}
      {activeNav === 'setup_books' && <AcademicSetupModule section="books" />}
      {activeNav === 'setup_jamaats' && <AcademicSetupModule section="jamaats" />}
      {activeNav === 'academic' && <AcademicModule />}
      {activeNav === 'teachers' && <TeachersModule onNavigate={setActiveNav} />}
      {activeNav === 'teacher_salary' && <TeacherSalaryModule />}
      {activeNav === 'teacher_dues' && <TeacherDuesModule />}
      {activeNav === 'teacher_schedules' && <TeacherScheduleModule />}
      {activeNav === 'teacher_live' && <TeacherLiveStatusModule />}
      {activeNav === 'leaves' && <LeaveManagementModule />}
      {activeNav === 'students' && <StudentsModule />}
      {activeNav === 'attendance' && <AttendanceModule />}
      {activeNav === 'exams' && <ExamsModule />}
      {activeNav === 'hostel' && <HostelModule />}
      {activeNav === 'library' && <LibraryModule />}
      {activeNav === 'finance' && <FinanceModule />}
      {activeNav === 'notices' && <NoticesModule />}
      {activeNav === 'messaging' && <MessagingModule />}
      {activeNav === 'reports' && <ReportsModule />}
      {activeNav === 'audit_logs' && <InstitutionAuditLogsModule />}
      {activeNav === 'support' && <InstitutionSupportModule />}
      {activeNav === 'settings' && <SettingsModule />}
    </AppShell>
  );
}
