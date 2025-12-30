import type { Doctor, Appointment } from '../types/index.js';
export declare function getDoctors(): Promise<Doctor[]>;
export declare function addAppointment(appointment: Appointment): Promise<void>;
export declare function updateAppointmentDetails(appointment: Appointment): Promise<void>;
export declare function updateAppointmentStatus(appointmentId: string, status: 'Paid' | 'Failed'): Promise<void>;
export declare function getAppointmentsToday(): Promise<Appointment[]>;
export declare function getAppointmentById(appointmentId: string): Promise<Appointment | undefined>;
export declare function markReminderSent(appointmentId: string): Promise<void>;
export declare function getSlotCounts(doctorName: string, date: string): Promise<Record<string, number>>;
export declare function getAppointmentsByChatId(chatId: string): Promise<Appointment[]>;
export declare function updateAppointmentReport(appointmentId: string, reportLink: string): Promise<void>;
export declare function updateAppointmentPaymentMessageId(appointmentId: string, messageId: number): Promise<void>;
export declare function updateAppointmentPaidEventId(appointmentId: string, paidEventId: string): Promise<void>;
//# sourceMappingURL=googleSheets.d.ts.map