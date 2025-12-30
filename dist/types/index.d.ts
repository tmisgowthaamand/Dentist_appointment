export interface Doctor {
    doctorId: string;
    doctorName: string;
    specialty: string;
    slots: string[];
    status: 'Available' | 'Not Available';
    slotCapacities: Record<string, number>;
}
export interface Appointment {
    appointmentId: string;
    patientName: string;
    phone: string;
    age: string;
    gender: string;
    doctorName: string;
    date: string;
    slot: string;
    purpose: string;
    paymentStatus: 'Pending' | 'Paid' | 'Failed';
    paymentMode: 'Online' | 'Clinic';
    reminderSent: boolean;
    telegramChatId: string;
    paidEventId?: string;
    medicalReportLink?: string | undefined;
    paymentMessageId?: number | undefined;
}
export interface UserState {
    step: 'IDLE' | 'AWAITING_NAME' | 'AWAITING_PHONE' | 'AWAITING_AGE' | 'AWAITING_GENDER' | 'AWAITING_PURPOSE' | 'SELECTING_DOCTOR' | 'SELECTING_SLOT' | 'SELECTING_PAYMENT_MODE' | 'AWAITING_PAYMENT' | 'CANCELLING' | 'AWAITING_REPORT_CHOICE' | 'AWAITING_REPORT_UPLOAD' | 'AWAITING_CANCEL_SELECTION';
    patientName?: string;
    phone?: string;
    age?: string;
    gender?: string;
    purpose?: string;
    language?: string;
    doctorId?: string;
    doctorName?: string;
    slot?: string;
    date?: string;
    paymentLinkId?: string;
    paymentMode?: 'Online' | 'Clinic';
    cancelAppointmentId?: string;
    lastAppointmentId?: string;
    pendingCancellations?: Appointment[];
    availableSlots?: string[];
    slotCapacities?: Record<string, number>;
    doctorCapacities?: Record<string, number>;
}
//# sourceMappingURL=index.d.ts.map