import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function LocationPermissionModal({ visible, onRequestPermission, onCancel, lang = 'en' }) {
  const isAr = lang === 'ar';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.icon}>📍</Text>

          <Text style={styles.title}>
            {isAr ? 'إذن تتبع الموقع الجغرافي' : 'Location Permission Request'}
          </Text>

          <Text style={styles.subtitle}>
            {isAr
              ? 'تطبيق Delivery Express يطلب الوصول للموقع الجغرافي دائماً (حتى في الخلفية) لتتمكن الإدارة من متابعة خطوط سير التسليم أثناء وردية العمل النشطة.'
              : 'Delivery Express requires background location access ("Always Allow") to enable supervisors to monitor active delivery routes while you are on duty.'}
          </Text>

          <View style={styles.bulletBox}>
            <Text style={styles.bulletItem}>
              {isAr ? '• يتم التتبع فقط أثناء تفعيل حالة "متصل" والوردية نشطة.' : '• Location is tracked ONLY while your driver status is ONLINE and shift is active.'}
            </Text>
            <Text style={styles.bulletItem}>
              {isAr ? '• يمكنك إيقاف تتبع الموقع في أي وقت من زر التحكم بالصلاحيات.' : '• You can enable or disable Live GPS tracking at any time via the toggle in settings.'}
            </Text>
            <Text style={styles.bulletItem}>
              {isAr ? '• يتوقف التتبع فوراً بمجرد تسجيل الخروج أو إيقاف الوردية.' : '• Location tracking stops immediately when you clock out.'}
            </Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{isAr ? 'إلغاء' : 'Cancel'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.allowBtn} onPress={onRequestPermission}>
              <Text style={styles.allowText}>{isAr ? 'موافقة ومتابعة' : 'Allow & Continue'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8
  },
  icon: {
    fontSize: 42,
    marginBottom: 12
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center'
  },
  subtitle: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14
  },
  bulletBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    width: '100%',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  bulletItem: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 17,
    marginVertical: 3
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%'
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center'
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b'
  },
  allowBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    alignItems: 'center'
  },
  allowText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff'
  }
});
