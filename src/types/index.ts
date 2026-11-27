export type AccountType =
  | 'super_admin'
  | 'institution_admin'
  | 'teacher'
  | 'staff'
  | 'student'
  | 'guardian';

export type DashboardRoute = 'super_admin' | 'institution' | 'teacher' | 'student' | 'guardian';
export type SessionScope = 'super_admin' | 'institution';

export interface AuthUser {
  id: number;
  institution_id: number | null;
  username: string;
  full_name: string;
  account_type: AccountType;
  role_id: number | null;
  role_slug?: string;
  role_name: string;
  role_ids?: number[];
  role_names?: string[];
  permissions: Record<string, string[]>;
  dashboard_route?: DashboardRoute;
  session_scope?: SessionScope;
  photo_url: string;
  phone: string;
  must_change_password: number;
  impersonated_by_user_id: number | null;
}

export interface InstitutionInfo {
  id: number;
  name: string;
  code: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  motto?: string;
  established_year?: string;
  academic_year?: string;
  status?: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export interface RealtimeNotice {
  id: number;
  institution_id: number | null;
  title: string;
  description: string;
  publish_date: string;
  audience_type: string;
  created_by_name: string;
  is_read?: number;
}

export interface AppNotification {
  id: number;
  institution_id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  reference_type?: string;
  reference_id?: number | null;
  is_read: number;
  created_at: string;
}

export interface TeacherLiveStatusItem {
  teacher_id: number;
  user_id?: number;
  full_name: string;
  teacher_code: string;
  photo_url?: string;
  mobile?: string;
  teacher_department_name?: string;
  primary_designation?: string;
  status: 'in_class' | 'break' | 'free' | 'on_leave' | 'absent';
  verification_state: 'confirmed' | 'unconfirmed' | 'scheduled' | 'leave' | 'absent';
  current_schedule_id?: number | null;
  current_department?: string;
  current_class?: string;
  current_jamaat?: string;
  current_subject?: string;
  room_number?: string;
  start_time?: string;
  end_time?: string;
  next_class_time?: string;
  next_class_name?: string;
  leave_reason?: string;
  leave_start_date?: string;
  leave_end_date?: string;
  confirmed_at?: string | null;
  updated_at?: string;
}

