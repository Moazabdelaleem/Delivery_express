import React, { useState, useEffect, createContext, useContext } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  StatusBar,
  Alert,
  Image
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import io from 'socket.io-client';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import LocationPermissionModal from './components/LocationPermissionModal';
import PhotoCapture from './components/PhotoCapture';
import VoiceNoteRecorder from './components/VoiceNoteRecorder';
import { DELIVERY_OUTCOMES, getOutcomeByKey } from './deliveryOutcomes';
import { tStatusLabel } from './constants/statusLabels';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (_) {}

async function registerForPushNotificationsAsync(apiBaseUrl, userToken) {
  if (!Device || !Device.isDevice) {
    console.log('Push notifications require a physical device or dev build with push service enabled.');
    return;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      Alert.alert(
        'Enable Notifications',
        'Delivery Express needs notification permissions to alert you when new orders are assigned or updated.',
        [
          {
            text: 'Continue',
            onPress: async () => {
              const { status } = await Notifications.requestPermissionsAsync();
              if (status === 'granted') {
                await sendPushTokenToBackend(apiBaseUrl, userToken);
              }
            }
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }

    if (finalStatus === 'granted') {
      await sendPushTokenToBackend(apiBaseUrl, userToken);
    }
  } catch (err) {
    console.warn('Push notification registration warning:', err.message);
  }
}

async function sendPushTokenToBackend(apiBaseUrl, userToken) {
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData?.data;

    if (pushToken && userToken) {
      await fetch(`${apiBaseUrl}/users/push-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`
        },
        body: JSON.stringify({ push_token: pushToken })
      });
      console.log('✅ Registered Expo Push Token with backend:', pushToken);
    }
  } catch (err) {
    console.warn('Failed to send push token to backend:', err.message);
  }
}

const DEFAULT_HOST = 'https://delivery-express-ten.vercel.app';

// 1-Tap Quick Login Preset Accounts
const DEMO_ACCOUNTS = [
  { role: 'delivery_guy', name: ' Sami', username: 'sami_delivery', color: '#10b981' },
  { role: 'supervisor', name: '👔 Kareem', username: 'kareem_supervisor', color: '#3b82f6' },
  { role: 'inventory', name: 'Hassan', username: 'hassan_inventory', color: '#f59e0b' },
  { role: 'finance', name: 'Mona', username: 'mona_finance', color: '#8b5cf6' },
  { role: 'manager', name: 'Tarek', username: 'tarek_manager', color: '#ec4899' },
];

// ==========================================
// 1. I18N DICTIONARY & TRANSLATION ENGINE
// ==========================================
const dynamicDictionary = {
  "Sami Delivery": "سامي للتوصيل",
  "Sami": "سامي",
  "John": "جون",
  "Test Client John": "عميل تجريبي جون",
  "Test Client": "عميل تجريبي",
  "Client": "عميل",
  "moaz": "معاذ",
  "Moaz": "معاذ",
  "Ahmed Hassan": "أحمد حسن",
  "Kareem Supervisor": "كريم المشرف",
  "Hassan Inventory": "حسن المخزن",
  "Mona Finance": "منى المالية",
  "Tarek Manager": "طارق المدير التنفيذي",
  "Building 12, GIU Campus": "مبنى ١٢، حرم الجامعة الألمانية الدولية (GIU)",
  "GIU Campus": "حرم الجامعة الألمانية الدولية",
  "Maadi Degla, St 206, Villa 12": "المعادي دجلة، شارع ٢٠٦، فيلا ١٢",
  "New Cairo, 5th Settlement": "القاهرة الجديدة، التجمع الخامس",
  "fuel refill": "تموين بنزين للموتوسيكل",
  "fuel refill for motorcycle": "تموين بنزين للموتوسيكل",
  "Packaging tape and boxes": "شريط تغليف وصناديق",
  "Parking fee": "رسوم انتظار وتأمين",
  "Mobile recharge for client calls": "كارت شحن للمكالمات مع العملاء"
};

const translations = {
  en: {
    brandName: "Delivery Express Mobile",
    loginTitle: "Enterprise Portal",
    loginSubtitle: "Sign in with your unique username and password",
    registerTitle: "Create Account",
    registerSubtitle: "Select your role & set up your profile",

    tabActiveRoutes: "Active Routes",
    tabWalletsExpenses: "Wallets & Expenses",
    tabHistory: "Order History",
    tabDispatchBoard: "Dispatch Board",
    tabDriverRoster: "Driver Roster",
    tabWarehouseQueue: "Warehouse Queue",
    tabStagingIssues: "Staging Issues",
    tabDriverWallets: "Driver Wallets",
    tabAuditHistory: "Audit & History",
    tabApprovalsRoster: "Executive Approvals",
    tabMasterOverview: "Master Dashboard",
    tabOpsBoard: "Operations Board",
    tabExpensesLog: "Expenses Breakdown",
    tabFleetRoster: "Fleet Roster",
    tabApprovalsRoster: "Executive Approvals",

    execHeaderTitle: "Executive Master Command Center",
    execHeaderSubtitle: "Full read-only master oversight across all departments & operations",
    execFleetCardLabel: "FLEET ROSTER",
    execOnlineDrivers: "Online Drivers",
    execOrdersCardLabel: "SYSTEM ORDERS",
    execCompletedOrders: "Completed",
    execCashCardLabel: "CASH HELD",
    execCashLiability: "Collection Liability",
    execExpensesCardLabel: "EXPENSES",
    execExpensesSpent: "Spent on Expenses",
    execDepartmentOverviews: "Department Overviews",
    execSupervisorDeptTitle: "👔 Supervisor & Dispatch Operations",
    execActiveOrders: "Active Orders",
    execInTransit: "In Transit",
    execTapOpsBoard: "Tap to inspect Operations Board",
    execWarehouseDeptTitle: "Warehouse & Staging Queue",
    execPendingHandoff: "Packages Pending Handoff",
    execReportedIssues: "Reported Issues",
    execTapWarehouseQueue: "Tap to inspect Warehouse Queue",
    execFinanceDeptTitle: "Finance & Driver Wallets",
    execDriversMonitored: "Drivers Monitored",
    execCashSettled: "Cash Settled",
    execTapFleetWallets: "Tap to inspect Fleet Wallets",
    execAllOpsTitle: "All System Operations & Orders (Read-Only)",
    execFleetRosterTitle: "Fleet Roster & Driver Wallets (Read-Only)",
    execFleetExpensesTitle: "Fleet Expenses Breakdown (Read-Only)",
    execCollectionCash: "COLLECTION CASH",
    execPocketAllowance: "POCKET ALLOWANCE",
    execNoExpensesYet: "No expenses logged yet.",

    usernameLabel: "Username",
    passwordLabel: "Password",
    confirmPasswordLabel: "Confirm Password",
    fullNameLabel: "Full Name",
    emailLabel: "Email (optional)",
    phoneLabel: "Phone Number (optional)",
    selectRoleLabel: "Select Workstation Role",
    usernamePlaceholder: "e.g. sami_delivery",
    registerUsernamePlaceholder: "Choose a unique username",
    passwordPlaceholder: "••••••••",
    registerPasswordPlaceholder: "At least 6 characters",
    confirmPasswordPlaceholder: "Re-enter your password",
    namePlaceholder: "e.g. Sami Ahmed",
    rememberMeLabel: "Remember me on this device",
    quickLoginsTitle: "Quick Demo Accounts (Tap to Switch Role):",

    signInBtn: "Sign In to Dashboard",
    registerBtn: "Create My Account",
    dontHaveAccountLink: "New User? Tap here to create an account",
    alreadyHaveAccountLink: "Already have an account? Tap here to sign in",
    logout: "Logout",
    lightMode: "Light",
    darkMode: "Dark",
    cancel: "Cancel",

    roleDeliveryGuy: " Delivery Guy",
    roleSupervisor: "👔 Supervisor",
    roleInventory: "Inventory",
    roleFinance: "Finance",
    roleManager: "Exec. Manager",
    delivery_guy: "Delivery Guy",
    supervisor: "Supervisor",
    inventory: "Inventory Staff",
    finance: "Finance & Accounting",
    manager: "Executive Manager",

    collectionWallet: "Collection Cash Wallet",
    pocketWallet: "Pocket Allowance",
    cashLiability: "Cash liability held",
    fuelExpenses: "Fuel & Expenses",

    logExpenseBtn: "Log Fuel / Pocket Expense",
    assignedDeliveries: " My Assigned Deliveries",
    noDeliveries: "No active deliveries assigned yet.",
    noHistory: "No past order history found.",
    amountToCollect: "Price / Collect",
    pickupFromWarehouse: "Picked Up from Warehouse",
    pickupGoToInventory: "Go to the inventory to pick it up",
    pickupGoToInventoryMsg: "Please go to the inventory/warehouse to physically pick up this package before confirming.",
    pickupGoToInventoryConfirm: "I've Picked It Up — Confirm",
    startTransit: " Start Transit",
    deliveredCollect: "Delivered & Collect Cash",
    deliveryFailed: "Delivery Failed",
    goOnline: "Go Online",
    goOffline: "⭕ Go Offline",
    clockInBtn: "🟢 Clock In / Go Active",
    clockOutBtn: "🔴 Clock Out / Go Offline",
    liveGpsToggleLabel: "📡 Live GPS Tracking",
    liveGpsOn: "GPS Tracking Active 🟢",
    liveGpsOff: "GPS Tracking Off 🔴",
    gpsDisabledWarning: "⚠️ Live GPS Tracking is disabled",
    gpsDisconnectedAlert: "⚠️ GPS Signal Lost (>2 min)",
    workedHoursToday: "Worked Hours Today",
    voiceFeedbackTitle: "🎙️ Customer Voice Feedback",
    takePhotoBtn: "📷 Take Photo / Attachment",
    youAreOnline: "You are Online — Ready for deliveries",
    youAreOffline: "You are Offline",
    driverStatusLabel: "Driver Status",

    dispatchOrder: "Dispatch New Order",
    allOrders: "All Active Orders",
    statusLabel: "Status",
    orderAmountLabel: "Amount to Collect (EGP) *",

    warehouseQueue: "Warehouse Package Queue",
    confirmHandoff: "Confirm Warehouse Handoff",
    reportInventoryIssue: "Report Pickup Issue",
    inventoryIssueTitle: "Warehouse Staging Issue",
    reasonItemDamaged: "Package Damaged During Staging",
    reasonItemMissing: "Item Missing From Bay Shelf",
    reasonDriverDeclined: "Driver Declined Pickup",
    confirmIssueBtn: "Report Issue & Update Queue",

    clearCashPullout: "Clear Cash Pullout",
    topUpPocket: "Top Up Pocket Allowance",
    pulloutModalTitle: "Collection Cash Settlement",
    topupModalTitle: "Pocket Allowance Top-Up",
    amountToPullLabel: "Pullout Amount (EGP)",
    topupAmountLabel: "Top-Up Amount (EGP)",
    notesLabel: "Audit Notes / Reference",
    confirmPulloutBtn: "Confirm Cash Settlement",
    confirmTopupBtn: "Confirm Top-Up Deposit",

    deliveryFailureTitle: "Delivery Failure Reason",
    selectFailureReason: "Select or type reason for failure:",
    reasonClientUnreachable: "Client Unreachable",
    reasonWrongAddress: "Incorrect / Invalid Address",
    reasonClientRefused: "Client Refused Package",
    reasonClientCancelled: "Client Cancelled On Arrival",
    confirmFailureBtn: "Confirm Delivery Failure",

    deliveryRoster: "Delivery Roster & Wallets",
    pendingApprovals: "Pending Executive Approvals",
    noPending: "No pending executive manager requests.",
    approveAccount: "Approve Account",
    rejectAccount: "Reject Request",
    rejectConfirmTitle: "Reject Account",
    rejectConfirmBody: "Are you sure you want to reject and remove this manager request?",
    wipeSystem: "Wipe Mock Data & Reset System",

    logPocketExpenseTitle: "Log Pocket Expense",
    amountSpentLabel: "Amount Spent ($) *",
    mandatoryReasonLabel: "Mandatory Reason *",
    amountPlaceholder: "e.g. 25.50",
    reasonPlaceholder: "e.g. Fuel refill for motorcycle",
    submitExpense: "Submit Expense",

    dispatchOrderTitle: "Dispatch New Order",
    clientAddressLabel: "Delivery Address *",
    orderAmountPlaceholder: "e.g. 150.00",
    dispatchOrderBtn: "Dispatch Order",
    clientAddressPlaceholder: "Enter delivery address",

    serverIpLabel: "Server IP:",

    validationEnterAll: "Please enter your username and password",
    validationRegRequired: "Username, password, full name and matching passwords are required",
    passwordMismatch: "Passwords do not match. Please try again.",
    alertWipeTitle: "Wipe System Data",
    alertWipeBody: "Are you sure you want to wipe all test orders and expenses? This cannot be undone.",
    alertWipeConfirm: "Wipe Clean",
    alertWipedTitle: "Wiped Clean",
    alertWipedBody: "System has been reset for production use.",
    alertSuccess: "Success",
    alertError: "Error",
    orderCreatedMsg: "New order created & dispatched!",
    addressRequiredMsg: "Delivery Address and Price are required to dispatch order.",
    handoffSuccess: "Package handed over to driver!",
    handoffFail: "Handoff failed",
    expenseSuccess: "Expense recorded! Remaining balance:",
    expenseFail: "Could not record expense",
    networkError: "Network connection failed. Check server IP.",
    statusUpdated: "Status updated to",
    approvedMsg: "Account approved successfully!",
    rejectedMsg: "Pending account rejected & removed.",
    wipeFailMsg: "Clean wipe failed. Check your connection.",

    languageName: "العربية"
  },
  ar: {
    brandName: "ديليفري إكسبريس موبايل",
    loginTitle: "منظومة إدارة الشحن والتوصيل",
    loginSubtitle: "سجل الدخول باستخدام اسم المستخدم وكلمة المرور",
    registerTitle: "إنشاء حساب جديد",
    registerSubtitle: "حدد طبيعة عملك وأنشئ ملفك الشخصي",

    tabActiveRoutes: "الشحنات الحالية",
    tabWalletsExpenses: "المافظ والمصاريف",
    tabHistory: "سجل الشحنات",
    tabDispatchBoard: "لوحة الإسناد",
    tabDriverRoster: "كشف المندوبين",
    tabWarehouseQueue: "قائمة المخزن",
    tabStagingIssues: "مشاكل التجهيز",
    tabDriverWallets: "محافظ المندوبين",
    tabAuditHistory: "السجل والتدقيق",
    tabMasterOverview: "اللوحة الرئيسية الشاملة",
    tabOpsBoard: "شاشة العمليات بالكامل",
    tabExpensesLog: "كشف المصاريف بالكامل",
    tabFleetRoster: "كشف المندوبين",
    tabApprovalsRoster: "الموافقات المعلقة",

    execHeaderTitle: "لوحة القيادة التنفيذية الشاملة",
    execHeaderSubtitle: "رقابة شاملة وقراءة فقط لكافة الأقسام والمندوبين والعمليات",
    execFleetCardLabel: "كشف المندوبين",
    execOnlineDrivers: "متصل الآن",
    execOrdersCardLabel: "شحنات النظام",
    execCompletedOrders: "مكتملة",
    execCashCardLabel: "نقدية التحصيل",
    execCashLiability: "نقدية بحوزة المندوبين",
    execExpensesCardLabel: "المصاريف المسجلة",
    execExpensesSpent: "مصاريف عهدة مسجلة",
    execDepartmentOverviews: "ملخص الأقسام التنفيذية",
    execSupervisorDeptTitle: "👔 قسم الإشراف والعمليات",
    execActiveOrders: "شحنات نشطة",
    execInTransit: "بالطريق",
    execTapOpsBoard: "اضغط لاستعراض شاشة العمليات",
    execWarehouseDeptTitle: "قسم المخزن والتجهيز",
    execPendingHandoff: "شحنات بانتظار التسليم للمندوب",
    execReportedIssues: "بلاغات مشاكل بالمخزن",
    execTapWarehouseQueue: "اضغط لاستعراض قائمة المخزن",
    execFinanceDeptTitle: "قسم المالية ومحافظ المندوبين",
    execDriversMonitored: "مندوبين تحت الرقابة",
    execCashSettled: "نقدية محصلة",
    execTapFleetWallets: "اضغط لاستعراض محافظ المندوبين",
    execAllOpsTitle: "سجل العمليات والشحنات بالكامل (قراءة فقط)",
    execFleetRosterTitle: "كشف المندوبين والمحافظ (قراءة فقط)",
    execFleetExpensesTitle: "كشف مصاريف المندوبين (قراءة فقط)",
    execCollectionCash: "نقدية التحصيل",
    execPocketAllowance: "مصروف العهدة",
    execNoExpensesYet: "لا توجد مصاريف مسجلة حتى الآن.",

    usernameLabel: "اسم المستخدم",
    passwordLabel: "كلمة المرور",
    confirmPasswordLabel: "تأكيد كلمة المرور",
    fullNameLabel: "الاسم بالكامل",
    emailLabel: "البريد الإلكتروني (اختياري)",
    phoneLabel: "رقم الهاتف (اختياري)",
    selectRoleLabel: "اختر نوع حساب العمل",
    usernamePlaceholder: "مثال: sami_delivery",
    registerUsernamePlaceholder: "اختر اسم مستخدم فريد",
    passwordPlaceholder: "••••••••",
    registerPasswordPlaceholder: "٦ أحرف على الأقل",
    confirmPasswordPlaceholder: "أعد إدخال كلمة المرور",
    namePlaceholder: "مثال: سامي أحمد",
    rememberMeLabel: "تذكرني على هذا الجهاز (البقاء متصلاً)",
    quickLoginsTitle: "دخول سريع لدور العمل (اضغط للتجربة):",

    signInBtn: "تسجيل الدخول للوحة التحكم",
    registerBtn: "إنشاء حسابي الآن",
    dontHaveAccountLink: "مستخدم جديد؟ اضغط هنا لإنشاء حساب",
    alreadyHaveAccountLink: "لديك حساب؟ اضغط هنا لتسجيل الدخول",
    logout: "تسجيل الخروج",
    lightMode: "الوضع الفاتح",
    darkMode: "الوضع الداكن",
    cancel: "إلغاء",

    roleDeliveryGuy: " مندوب التوصيل",
    roleSupervisor: "👔 المشرف",
    roleInventory: "المخزن",
    roleFinance: "المالية",
    roleManager: "مدير تنفيذي",
    delivery_guy: "مندوب التوصيل",
    supervisor: "مشرف العمليات",
    inventory: "مسؤول المخزن",
    finance: "الشؤون المالية",
    manager: "المدير التنفيذي",

    collectionWallet: "محفظة التحصيل النقدي",
    pocketWallet: "مصاريف العهدة الشخصية",
    cashLiability: "إجمالي المبالغ المحصلة",
    fuelExpenses: "مصاريف الوقود والصيانة",

    logExpenseBtn: "تسجيل مصروف عهدة (بنزين/صيانة)",
    assignedDeliveries: "الشحنات المسندة إليّ اليوم",
    noDeliveries: "لا توجد شحنات مسندة حالياً.",
    noHistory: "لا يوجد سجل شحنات سابقة.",
    amountToCollect: "المبلغ المطلوب تحصيله",
    pickupFromWarehouse: "استلمت الشحنة من المخزن",
    pickupGoToInventory: "اذهب للمخزن لاستلام الشحنة",
    pickupGoToInventoryMsg: "يرجى التوجه إلى المخزن لاستلام الطرد فعلياً قبل تأكيد الاستلام.",
    pickupGoToInventoryConfirm: "استلمتها — تأكيد",
    startTransit: " بدء خط السير والتوصيل",
    deliveredCollect: "تم التسليم وتحصيل المبلغ",
    deliveryFailed: "فشل التسليم للعميل",
    goOnline: "الدخول للعمل",
    goOffline: "⭕ الخروج من العمل",
    youAreOnline: "أنت متاح — جاهز لاستقبال الشحنات",
    youAreOffline: "أنت غير متاح الآن",
    driverStatusLabel: "حالة المندوب",

    dispatchOrder: "إضافة وإسناد شحنة جديدة",
    allOrders: "سجل الشحنات النشطة",
    statusLabel: "الحالة",
    orderAmountLabel: "مبلغ التحصيل (ج.م) *",

    warehouseQueue: "قائمة الشحنات بالمخزن",
    confirmHandoff: "تأكيد تسليم الشحنة للمندوب",
    reportInventoryIssue: "الإبلاغ عن مشكلة استلام",
    inventoryIssueTitle: "مشكلة في تجهيز الشحنة بالمخزن",
    reasonItemDamaged: "تلف المنتجات أثناء التجهيز",
    reasonItemMissing: "المنتج غير موجود على الرف",
    reasonDriverDeclined: "المندوب رفض استلام الشحنة",
    confirmIssueBtn: "إثبات المشكلة وتحديث القائمة",

    clearCashPullout: "تسوية وتفريغ النقدية",
    topUpPocket: "شحن عهدة المصاريف",
    pulloutModalTitle: "توريد وتحصيل المبالغ النقدية",
    topupModalTitle: "شحن عهدة مصاريف للمندوب",
    amountToPullLabel: "المبلغ المورد للمكتب (ج.م)",
    topupAmountLabel: "مبلغ الشحن (ج.م)",
    notesLabel: "ملاحظات السند والتوريد",
    confirmPulloutBtn: "تأكيد توريد النقدية",
    confirmTopupBtn: "تأكيد شحن العهدة",

    deliveryFailureTitle: "سبب عدم تسليم الشحنة",
    selectFailureReason: "اختر أو اكتب سبب عدم التسليم:",
    reasonClientUnreachable: "العميل لا يرد / الهاتف مغلق",
    reasonWrongAddress: "العنوان غير صحيح / خطأ في الموقع",
    reasonClientRefused: "العميل رفض استلام الشحنة",
    reasonClientCancelled: "العميل ألغى الطلب عند الوصول",
    confirmFailureBtn: "تأكيد إثبات عدم التسليم",

    deliveryRoster: "كشف المندوبين والمافظ",
    pendingApprovals: "طلبات الموافقة للمدراء التنفيذيين",
    noPending: "لا توجد طلبات معلقة حالياً.",
    approveAccount: "الموافقة",
    rejectAccount: "رفض الطلب",
    rejectConfirmTitle: "رفض الحساب",
    rejectConfirmBody: "هل أنت متأكد من رفض وإزالة طلب هذا المدير؟",
    wipeSystem: "مسح البيانات التجريبية وإعادة الضبط",

    logPocketExpenseTitle: "تسجيل مصروف عهدة",
    amountSpentLabel: "المبلغ المصروف ($) *",
    mandatoryReasonLabel: "سبب الصرف (إجباري) *",
    amountPlaceholder: "مثال: ٢٥.٥٠",
    reasonPlaceholder: "مثال: تموين بنزين للموتوسيكل",
    submitExpense: "تسجيل المصروف",

    dispatchOrderTitle: "إضافة وإسناد شحنة جديدة",
    clientAddressLabel: "عنوان التوصيل *",
    orderAmountPlaceholder: "مثال: ١٥٠.٠٠",
    dispatchOrderBtn: "إسناد الشحنة فوراً",
    clientAddressPlaceholder: "أدخل عنوان التوصيل الفعلي",

    serverIpLabel: "IP السيرفر:",

    validationEnterAll: "يرجى إدخال اسم المستخدم وكلمة المرور",
    validationRegRequired: "اسم المستخدم والاسم الكامل وكلمة المرور وتأكيدها كلها مطلوبة",
    passwordMismatch: "كلمتا المرور غير متطابقتين. يرجى المحاولة مجدداً.",
    alertWipeTitle: "مسح بيانات النظام",
    alertWipeBody: "هل أنت متأكد من مسح جميع الطلبات والبيانات التجريبية؟ لا يمكن التراجع عن هذا الإجراء.",
    alertWipeConfirm: "مسح الكل",
    alertWipedTitle: "تمت إعادة الضبط",
    alertWipedBody: "تمت إعادة ضبط النظام للاستخدام الفعلي.",
    alertSuccess: "نجح الإجراء",
    alertError: "حدث خطأ",
    orderCreatedMsg: "تم إنشاء الشحنة وإسنادها بنجاح!",
    addressRequiredMsg: "عنوان التوصيل والسعر مطلوبان لإنشاء وإسناد الشحنة.",
    handoffSuccess: "تم تسليم الشحنة للمندوب بنجاح!",
    handoffFail: "فشل إتمام عملية التسليم",
    expenseSuccess: "تم تسجيل المصروف! الرصيد المتبقي:",
    expenseFail: "تعذر تسجيل المصروف",
    networkError: "تعذر الاتصال بالسيرفر. تأكد من صحة IP السيرفر.",
    statusUpdated: "تم تحديث الحالة إلى",
    approvedMsg: "تمت الموافقة على الحساب بنجاح!",
    rejectedMsg: "تم رفض الطلب وإزالته.",
    wipeFailMsg: "فشل مسح البيانات. تحقق من الاتصال.",

    languageName: "English"
  }
};

const LanguageContext = createContext();

function LanguageProvider({ children }) {
  const [lang, setLang] = useState('en');

  const toggleLanguage = () => {
    setLang((prev) => (prev === 'en' ? 'ar' : 'en'));
  };

  const t = (key) => translations[lang]?.[key] || translations['en']?.[key] || key;

  const tStatus = (status) => {
    if (!status) return '';
    return tStatusLabel(status, lang);
  };

  const dt = (text) => {
    if (!text) return '';
    if (lang === 'en') return text;
    let result = String(text).trim();
    for (const key of Object.keys(dynamicDictionary)) {
      if (result.toLowerCase().includes(key.toLowerCase())) {
        const reg = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        result = result.replace(reg, dynamicDictionary[key]);
      }
    }
    return result;
  };

  return (
    <LanguageContext.Provider value={{ lang, toggleLanguage, t, tStatus, dt }}>
      {children}
    </LanguageContext.Provider>
  );
}

const useLanguage = () => useContext(LanguageContext);

export default function AppWrapper() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <MainApp />
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

function MainApp() {
  const { lang, toggleLanguage, t, tStatus, dt } = useLanguage();
  const isRTL = lang === 'ar';

  const getStatusColor = (s) => {
    switch (s) {
      case 'delivered':
      case 'cash_cleared':
        return '#10b981';
      case 'in_transit':
        return '#2563eb';
      case 'handed_to_delivery':
        return '#7c3aed';
      case 'assigned':
      case 'notified_inventory':
        return '#f59e0b';
      case 'delivery_failed':
      case 'pickup_failed':
        return '#ef4444';
      default:
        return '#64748b';
    }
  };

  const [serverHost, setServerHost] = useState(process.env.EXPO_PUBLIC_API_URL || DEFAULT_HOST);
  const apiBase = (serverHost.startsWith('http://') || serverHost.startsWith('https://'))
    ? (serverHost.endsWith('/api') ? serverHost : `${serverHost.replace(/\/$/, '')}/api`)
    : `http://${serverHost}:5000/api`;

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [activeAuthTab, setActiveAuthTab] = useState('login');

  const [activeTab, setActiveTab] = useState('tab1');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('delivery_guy');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [authError, setAuthError] = useState('');
  const [approvalModal, setApprovalModal] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

  const [orders, setOrders] = useState([]);
  const [deliveryGuys, setDeliveryGuys] = useState([]);
  const [financeWallets, setFinanceWallets] = useState([]);
  const [walletSummary, setWalletSummary] = useState(null);
  const [expensesBreakdown, setExpensesBreakdown] = useState(null);
  const [pendingManagers, setPendingManagers] = useState([]);
  const [notification, setNotification] = useState(null);
  const [driverOnline, setDriverOnline] = useState(false);

  // Feature States
  const [liveGpsEnabled, setLiveGpsEnabled] = useState(true);
  const [showLocationModal, setShowLocationModal] = useState(false);

  const [outcomeModal, setOutcomeModal] = useState(false);
  const [outcomeStep, setOutcomeStep] = useState(1);
  const [selectedOrderForOutcome, setSelectedOrderForOutcome] = useState(null);

  const [cameraModal, setCameraModal] = useState(false);
  const [selectedCameraOrder, setSelectedCameraOrder] = useState(null);
  const [cameraStage, setCameraStage] = useState('payment_confirmation');
  const [cameraFilterText, setCameraFilterText] = useState('');
  const [selectedOutcomeKey, setSelectedOutcomeKey] = useState('full_cash_full');
  const [deliveredAmountInput, setDeliveredAmountInput] = useState('');
  const [returnedAmountInput, setReturnedAmountInput] = useState('');
  const [returnedQuantityInput, setReturnedQuantityInput] = useState('1');
  const [returnNotesInput, setReturnNotesInput] = useState('');

  const [paymentModal, setPaymentModal] = useState(false);
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [paymentMethodInput, setPaymentMethodInput] = useState('cash');
  const [paymentProofAttachmentId, setPaymentProofAttachmentId] = useState(null);

  const [paymentTypeInput, setPaymentTypeInput] = useState('pay_after_delivery');

  const [returnPickups, setReturnPickups] = useState([]);

  // ==========================================
  // UNIFIED GLOBAL MASTER WALLETS MAP
  // Reads the exact same state object X for all screens & roles
  // ==========================================
  const [sharedWalletsMap, setSharedWalletsMap] = useState({});

  const getDriverWallet = (driverKey) => {
    if (!driverKey) return { collection_balance: 0, pocket_balance: 0, total_topped_up: 0, total_spent: 0 };
    const key = String(driverKey).toLowerCase();
    const entry = sharedWalletsMap[key] || Object.values(sharedWalletsMap).find(w =>
      String(w.id || '').toLowerCase() === key ||
      String(w.delivery_guy_id || '').toLowerCase() === key ||
      String(w.username || '').toLowerCase() === key ||
      String(w.name || w.delivery_guy_name || '').toLowerCase() === key
    );

    return {
      collection_balance: entry?.collection_balance !== undefined ? parseFloat(entry.collection_balance) : 0.00,
      pocket_balance: entry?.pocket_balance !== undefined ? parseFloat(entry.pocket_balance) : 0.00,
      total_topped_up: entry?.total_topped_up !== undefined ? parseFloat(entry.total_topped_up) : 0.00,
      total_spent: entry?.total_spent !== undefined ? parseFloat(entry.total_spent) : 0.00
    };
  };

  const updateSharedWallet = (driverKeysArray, deltaTopup = 0, deltaExpense = 0, collectionOverride = null) => {
    setSharedWalletsMap(prev => {
      const nextMap = { ...prev };
      const keys = Array.isArray(driverKeysArray) ? driverKeysArray : [driverKeysArray];

      let baseEntry = null;
      for (const k of keys) {
        if (!k) continue;
        const normK = String(k).toLowerCase();
        if (nextMap[normK]) {
          baseEntry = nextMap[normK];
          break;
        }
      }

      const curColl = baseEntry?.collection_balance !== undefined ? parseFloat(baseEntry.collection_balance) : 0.00;
      const curPock = baseEntry?.pocket_balance !== undefined ? parseFloat(baseEntry.pocket_balance) : 50.00;
      const curTop = baseEntry?.total_topped_up !== undefined ? parseFloat(baseEntry.total_topped_up) : 50.00;
      const curSpent = baseEntry?.total_spent !== undefined ? parseFloat(baseEntry.total_spent) : 0.00;

      const updatedVal = {
        collection_balance: collectionOverride !== null ? parseFloat(collectionOverride) : curColl,
        pocket_balance: curPock + deltaTopup - deltaExpense,
        total_topped_up: curTop + deltaTopup,
        total_spent: curSpent + deltaExpense
      };

      for (const k of keys) {
        if (!k) continue;
        nextMap[String(k).toLowerCase()] = updatedVal;
      }
      return nextMap;
    });
  };

  const [expenseModal, setExpenseModal] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseReason, setExpenseReason] = useState('');
  const [expenseOrderId, setExpenseOrderId] = useState('');
  const [recordedAudioNote, setRecordedAudioNote] = useState(null);
  const [recordedAudioDuration, setRecordedAudioDuration] = useState(0);

  const [createOrderModal, setCreateOrderModal] = useState(false);
  const [createOrderStep, setCreateOrderStep] = useState(1);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [orderAmount, setOrderAmount] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  const [inventoryFilter, setInventoryFilter] = useState('all');
  const [execOpsFilter, setExecOpsFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [expandedCardId, setExpandedCardId] = useState(null);

  const [failureModal, setFailureModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [failureReason, setFailureReason] = useState('');

  const [orderStatusModal, setOrderStatusModal] = useState(false);
  const [selectedOrderForStatus, setSelectedOrderForStatus] = useState(null);

  const openOrderStatusModal = (order) => {
    setSelectedOrderForStatus(order);
    setOrderStatusModal(true);
  };

  const [expandedDriverWalletId, setExpandedDriverWalletId] = useState(null);

  const [driverStatsModal, setDriverStatsModal] = useState(false);
  const [selectedDriverForStats, setSelectedDriverForStats] = useState(null);

  const [pocketLedgerModal, setPocketLedgerModal] = useState(false);
  const [selectedDriverLedgerData, setSelectedDriverLedgerData] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const openPocketLedgerModal = async (driver) => {
    const driverId = driver.id || driver.delivery_guy_id;
    if (!driverId) return;
    setLoadingLedger(true);
    setPocketLedgerModal(true);
    try {
      const res = await fetch(`${apiBase}/wallets/ledger/${driverId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedDriverLedgerData(data);
      } else {
        setSelectedDriverLedgerData(null);
      }
    } catch (e) {
      console.log('Error fetching wallet ledger:', e);
      setSelectedDriverLedgerData(null);
    } finally {
      setLoadingLedger(false);
    }
  };

  const [orderAuditModal, setOrderAuditModal] = useState(false);
  const [selectedOrderForAudit, setSelectedOrderForAudit] = useState(null);
  const [auditTrailLogs, setAuditTrailLogs] = useState([]);
  const [orderAuditTab, setOrderAuditTab] = useState('history');
  const [orderAttachmentsList, setOrderAttachmentsList] = useState([]);
  const [orderFeedbackList, setOrderFeedbackList] = useState([]);
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [activeSoundObject, setActiveSoundObject] = useState(null);

  const handlePlayAudioFeedback = async (feedbackItem) => {
    const audioUrl = feedbackItem.audio_storage_url || feedbackItem.audio;
    if (!audioUrl) return;

    try {
      let AudioModule;
      try { AudioModule = require('expo-av').Audio; } catch (_) { AudioModule = null; }
      if (!AudioModule) return;

      if (activeSoundObject) {
        try { await activeSoundObject.stopAsync(); await activeSoundObject.unloadAsync(); } catch (_) {}
        setActiveSoundObject(null);
        if (playingAudioId === feedbackItem.id) {
          setPlayingAudioId(null);
          return;
        }
      }

      const fullUrl = (audioUrl.startsWith('http') || audioUrl.startsWith('data:'))
        ? audioUrl
        : `${apiBase.replace(/\/api\/?$/, '')}${audioUrl.startsWith('/') ? '' : '/'}${audioUrl}`;

      const { sound: newSound } = await AudioModule.Sound.createAsync(
        { uri: fullUrl },
        { shouldPlay: true }
      );
      setActiveSoundObject(newSound);
      setPlayingAudioId(feedbackItem.id);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setPlayingAudioId(null);
          setActiveSoundObject(null);
        }
      });
    } catch (err) {
      console.log('Error playing feedback audio:', err);
      setPlayingAudioId(null);
    }
  };

  const openDriverStatsModal = (driver) => {
    setSelectedDriverForStats(driver);
    setDriverStatsModal(true);
  };

  const [supervisorCardModal, setSupervisorCardModal] = useState(false);
  const [supervisorCardType, setSupervisorCardType] = useState('');

  const openSupervisorCard = (type) => {
    setSupervisorCardType(type);
    setSupervisorCardModal(true);
  };

  const openOrderAuditModal = async (order) => {
    setSelectedOrderForAudit(order);
    setOrderAuditModal(true);
    setOrderAuditTab('history');
    setAuditTrailLogs([]);
    setOrderAttachmentsList([]);
    setOrderFeedbackList([]);

    try {
      const res = await fetch(`${apiBase}/orders/${order.id}/audit-trail`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) setAuditTrailLogs(data);
    } catch (e) {
      console.log('Error loading audit trail:', e);
    }

    try {
      const attRes = await fetch(`${apiBase}/orders/${order.id}/attachments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const attData = await attRes.json();
      if (Array.isArray(attData)) setOrderAttachmentsList(attData);
      else if (attData.attachments) setOrderAttachmentsList(attData.attachments);
    } catch (e) {
      console.log('Error loading attachments:', e);
    }

    try {
      const fbRes = await fetch(`${apiBase}/orders/${order.id}/feedback`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const fbData = await fbRes.json();
      if (Array.isArray(fbData)) setOrderFeedbackList(fbData);
      else if (fbData.feedback) setOrderFeedbackList(fbData.feedback);
    } catch (e) {
      console.log('Error loading feedback:', e);
    }
  };

  const handleDownloadMedia = async (mediaUrl, filename) => {
    if (!mediaUrl) return;
    try {
      const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined' && document.createElement;
      const fullUrl = (mediaUrl.startsWith('http') || mediaUrl.startsWith('data:'))
        ? mediaUrl
        : `${apiBase.replace(/\/api\/?$/, '')}${mediaUrl.startsWith('/') ? '' : '/'}${mediaUrl}`;

      if (isWeb) {
        const link = document.createElement('a');
        link.href = fullUrl;
        link.download = filename || `download_${Date.now()}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(lang === 'ar' ? 'جاري تنزيل الملف...' : 'Downloading media file...');
      } else {
        let FileSystemModule, SharingModule;
        try { FileSystemModule = require('expo-file-system'); } catch (_) {}
        try { SharingModule = require('expo-sharing'); } catch (_) {}

        if (fullUrl.startsWith('data:')) {
          const parts = fullUrl.split(',');
          const base64Data = parts[1];
          const fileUri = `${FileSystemModule.documentDirectory}${filename || `download_${Date.now()}`}`;
          await FileSystemModule.writeAsStringAsync(fileUri, base64Data, {
            encoding: FileSystemModule.EncodingType.Base64
          });
          if (SharingModule && await SharingModule.isAvailableAsync()) {
            await SharingModule.shareAsync(fileUri);
          } else {
            showToast(lang === 'ar' ? 'تم تنزيل الملف بنجاح' : 'Media file downloaded successfully');
          }
        } else {
          const fileUri = `${FileSystemModule.documentDirectory}${filename || `download_${Date.now()}`}`;
          const downloadResult = await FileSystemModule.downloadAsync(fullUrl, fileUri);
          if (SharingModule && await SharingModule.isAvailableAsync()) {
            await SharingModule.shareAsync(downloadResult.uri);
          } else {
            showToast(lang === 'ar' ? 'تم تنزيل الملف بنجاح' : 'Media file downloaded successfully');
          }
        }
      }
    } catch (err) {
      console.error('Error downloading media file:', err);
      Alert.alert(t('alertError'), lang === 'ar' ? 'حدث خطأ أثناء تنزيل الملف' : 'Error downloading media file');
    }
  };

  const [inventoryIssueModal, setInventoryIssueModal] = useState(false);
  const [inventoryIssueReason, setInventoryIssueReason] = useState('');

  const [topupModal, setTopupModal] = useState(false);
  const [targetDriver, setTargetDriver] = useState(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupNotes, setTopupNotes] = useState('');

  const theme = isDarkMode ? darkTheme : lightTheme;

  const showToast = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    const loadSavedSession = async () => {
      try {
        const savedRemember = await AsyncStorage.getItem('@remember_me');
        if (savedRemember === 'true') {
          const savedToken = await AsyncStorage.getItem('@auth_token');
          const savedUserStr = await AsyncStorage.getItem('@auth_user');
          if (savedToken && savedUserStr) {
            const savedUser = JSON.parse(savedUserStr);
            setUser(savedUser);
            setToken(savedToken);
            setDriverOnline(savedUser.online_status === 'online');
            setActiveTab('tab1');
          }
        }
      } catch (e) {
        console.log('Error loading saved session:', e.message);
      }
    };
    loadSavedSession();
  }, []);

  // Periodic Auto-Sync Interval for dynamic multi-screen synchronization
  useEffect(() => {
    if (!token || !user) return;
    registerForPushNotificationsAsync(apiBase, token);

    const iv = setInterval(() => {
      fetchData();
    }, 4000);
    return () => clearInterval(iv);
  }, [token, user]);

  useEffect(() => {
    let sub;
    try {
      sub = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('🔔 Push notification tapped:', response.notification.request.content);
        setActiveTab('tab1');
      });
    } catch (err) {
      console.warn('Notification tap listener warning:', err.message);
    }
    return () => {
      if (sub && sub.remove) sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!token || !user) return;
    let socketHost = (serverHost.startsWith('http://') || serverHost.startsWith('https://'))
      ? serverHost.replace(/\/api\/?$/, '')
      : `http://${serverHost}:5000`;
    const socket = io(socketHost, {
      transports: ['websocket', 'polling'],
      timeout: 5000
    });

    socket.on('order_assigned', (data) => {
      if (user.role === 'delivery_guy' && data.delivery_guy_id === user.id) {
        showToast(lang === 'ar' ? 'تم إسناد شحنة جديدة لك!' : 'New order assigned to you!');
      }
      fetchData();
    });

    socket.on('status_changed', () => fetchData());
    socket.on('cash_cleared', () => fetchData());
    socket.on('pocket_topup', () => fetchData());
    socket.on('wallet_updated', () => fetchData());
    socket.on('online_status_changed', () => fetchData());

    return () => {
      socket.disconnect();
    };
  }, [token, user, serverHost, lang]);

  const handleLogin = async (overrideUser, overridePass) => {
    const loginUser = overrideUser || username;
    const loginPass = overridePass || password;

    if (!loginUser || !loginPass) {
      setAuthError(t('validationEnterAll'));
      return;
    }
    setLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass })
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.requiresApproval) {
          setApprovalModal(true);
        } else {
          setAuthError(data.error || 'Login failed');
        }
      } else {
        setUser(data.user);
        setToken(data.token);
        setDriverOnline(data.user.online_status === 'online');
        setActiveTab('tab1');

        if (rememberMe) {
          await AsyncStorage.setItem('@remember_me', 'true');
          await AsyncStorage.setItem('@auth_token', data.token);
          await AsyncStorage.setItem('@auth_user', JSON.stringify(data.user));
        } else {
          await AsyncStorage.removeItem('@remember_me');
          await AsyncStorage.removeItem('@auth_token');
          await AsyncStorage.removeItem('@auth_user');
        }

        showToast(`${dt('Welcome back')}, ${dt(data.user.name)}!`);
      }
    } catch (err) {
      setAuthError(`${t('networkError')} (${serverHost}:5000)`);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username || !password || !name || !confirmPassword) {
      setAuthError(t('validationRegRequired'));
      return;
    }
    if (password !== confirmPassword) {
      setAuthError(t('passwordMismatch'));
      return;
    }
    setLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${apiBase}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, name: name.trim(), role })
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Registration failed');
      } else {
        if (data.requiresApproval) {
          setApprovalModal(true);
          setActiveAuthTab('login');
        } else if (data.token && data.user) {
          setUser(data.user);
          setToken(data.token);
          setDriverOnline(false);
          setActiveTab('tab1');

          if (rememberMe) {
            await AsyncStorage.setItem('@remember_me', 'true');
            await AsyncStorage.setItem('@auth_token', data.token);
            await AsyncStorage.setItem('@auth_user', JSON.stringify(data.user));
          }

          showToast(lang === 'ar' ? `أهلاً بك ${data.user.name}! تم تسجيل الحساب ودخولك بنجاح` : `Welcome ${data.user.name}! Registered & logged in successfully`);
        } else {
          setActiveAuthTab('login');
          showToast(lang === 'ar' ? 'تم إنشاء الحساب بنجاح! يرجى تسجيل الدخول' : 'Account registered successfully! Please log in');
        }
      }
    } catch (err) {
      setAuthError(t('networkError'));
    } finally {
      setLoading(false);
    }
  };

const parseSafeJson = async (res) => {
  try {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      return { error: `Server response error (${res.status})` };
    }
  } catch (e) {
    return { error: e.message };
  }
};

  const fetchData = async () => {
    if (!token || !user) return;
    try {
      if (user.role === 'delivery_guy') {
        const oRes = await fetch(`${apiBase}/orders/my-deliveries`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const oData = await parseSafeJson(oRes);
        if (Array.isArray(oData)) setOrders(oData);

        const rRes = await fetch(`${apiBase}/returns/my-pickups`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const rData = await parseSafeJson(rRes);
        if (rData && Array.isArray(rData.return_pickups)) setReturnPickups(rData.return_pickups);

        const wRes = await fetch(`${apiBase}/wallets/summary`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const wData = await parseSafeJson(wRes);
        if (wRes.ok && wData) {
          setWalletSummary(wData);
          if (wData.pocket_wallet) {
            const p = wData.pocket_wallet;
            const col = wData.collection_wallet;
            const val = {
              collection_balance: parseFloat(col?.current_balance || 0),
              pocket_balance: parseFloat(p?.current_balance !== undefined ? p.current_balance : 50),
              total_topped_up: parseFloat(p?.total_topped_up !== undefined ? p.total_topped_up : 50),
              total_spent: parseFloat(p?.total_spent || 0)
            };
            setSharedWalletsMap(prev => ({
              ...prev,
              [String(user.id).toLowerCase()]: val,
              [String(user.username).toLowerCase()]: val
            }));
          }
        }
      } else {
        // Finance, Manager, Supervisor, Inventory
        const oRes = await fetch(`${apiBase}/orders/all`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const oData = await parseSafeJson(oRes);
        if (Array.isArray(oData)) setOrders(oData);

        const gRes = await fetch(`${apiBase}/auth/role/delivery_guy`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const gData = await parseSafeJson(gRes);
        if (Array.isArray(gData)) {
          setDeliveryGuys(gData);

          // Finance calls the EXACT SAME GET method per driver as the Delivery Guy screen
          for (const driver of gData) {
            const driverId = driver.id || driver.delivery_guy_id;
            if (driverId) {
              try {
                const dWRes = await fetch(`${apiBase}/wallets/summary?delivery_guy_id=${driverId}`, {
                  headers: { Authorization: `Bearer ${token}` }
                });
                const dWData = await parseSafeJson(dWRes);
                if (dWRes.ok && dWData && dWData.pocket_wallet) {
                  const p = dWData.pocket_wallet;
                  const col = dWData.collection_wallet;
                  const val = {
                    collection_balance: parseFloat(col?.current_balance || 0),
                    pocket_balance: parseFloat(p?.current_balance !== undefined ? p.current_balance : 50.00),
                    total_topped_up: parseFloat(p?.total_topped_up !== undefined ? p.total_topped_up : 50.00),
                    total_spent: parseFloat(p?.total_spent || 0)
                  };
                  setSharedWalletsMap(prev => ({
                    ...prev,
                    [String(driverId).toLowerCase()]: val,
                    [String(driver.username || '').toLowerCase()]: val,
                    [String(driver.name || '').toLowerCase()]: val
                  }));
                }
              } catch (errDriverWallet) {
                console.log('Driver GET wallet fetch error:', errDriverWallet);
              }
            }
          }
        }

        const wRes = await fetch(`${apiBase}/wallets/summary`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const wData = await parseSafeJson(wRes);
        if (Array.isArray(wData)) {
          setFinanceWallets(wData);
          setSharedWalletsMap(prev => {
            const nextMap = { ...prev };
            wData.forEach(w => {
              const val = {
                collection_balance: parseFloat(w.collection_balance || 0),
                pocket_balance: parseFloat(w.pocket_balance !== undefined ? w.pocket_balance : 50),
                total_topped_up: parseFloat(w.total_topped_up !== undefined ? w.total_topped_up : 50),
                total_spent: parseFloat(w.total_spent || 0)
              };
              if (w.id) nextMap[String(w.id).toLowerCase()] = val;
              if (w.delivery_guy_id) nextMap[String(w.delivery_guy_id).toLowerCase()] = val;
              if (w.username) nextMap[String(w.username).toLowerCase()] = val;
              if (w.name || w.delivery_guy_name) nextMap[String(w.name || w.delivery_guy_name).toLowerCase()] = val;
            });
            return nextMap;
          });
        }

        const expRes = await fetch(`${apiBase}/wallets/expenses/breakdown`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const expData = await parseSafeJson(expRes);
        if (expRes.ok && expData) setExpensesBreakdown(expData);
      }

      if (user.role === 'manager') {
        const pRes = await fetch(`${apiBase}/auth/pending-approvals`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const pData = await pRes.json();
        if (Array.isArray(pData)) setPendingManagers(pData);
      }
    } catch (err) {
      console.log('Fetch error:', err.message);
    }
  };

  useEffect(() => {
    if (token) fetchData();
  }, [token, user]);

  const clockInWithLocation = async () => {
    setActionLoadingId('toggleDriverStatus');
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('alertError'),
          lang === 'ar'
            ? 'إذن تحديد الموقع مطلوب لتأكيد الحضور في نطاق المخزن (٢٠٠ متر).'
            : 'Location permission is required to confirm warehouse clock-in attendance (200m radius).'
        );
        return;
      }

      let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;

      const res = await fetch(`${apiBase}/shifts/clock-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ lat, lng })
      });
      const data = await res.json();

      if (res.ok) {
        setDriverOnline(true);
        setUser(prev => prev ? { ...prev, online_status: 'online' } : prev);
        if (rememberMe && user) {
          await AsyncStorage.setItem('@auth_user', JSON.stringify({ ...user, online_status: 'online' }));
        }
        showToast(lang === 'ar' ? '🟢 تم تسجيل الحضور وتفعيل السائق بنجاح!' : '🟢 Clock-in successful! Driver active & online.');
        fetchData();
      } else {
        Alert.alert(
          lang === 'ar' ? '⚠️ رفض تسجيل الحضور (خارج نطاق المخزن)' : '⚠️ Clock-In Rejected (Geofence Alert)',
          data.error || 'Out of warehouse geofence radius.'
        );
      }
    } catch (e) {
      Alert.alert(t('alertError'), e.message || t('networkError'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const clockOutDriver = async () => {
    setActionLoadingId('toggleDriverStatus');
    try {
      const res = await fetch(`${apiBase}/shifts/clock-out`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setDriverOnline(false);
        setUser(prev => prev ? { ...prev, online_status: 'offline' } : prev);
        if (rememberMe && user) {
          await AsyncStorage.setItem('@auth_user', JSON.stringify({ ...user, online_status: 'offline' }));
        }
        showToast(lang === 'ar' ? '🔴 تم تسجيل الانصراف وإيقاف السائق' : '🔴 Clock-out successful. Driver offline.');
        fetchData();
      } else {
        Alert.alert(t('alertError'), data.error || 'Clock-out failed');
      }
    } catch (e) {
      Alert.alert(t('alertError'), t('networkError'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const toggleDriverStatus = () => {
    if (driverOnline) {
      clockOutDriver();
    } else {
      clockInWithLocation();
    }
  };

  const updateDeliveryStatus = async (orderId, newStatus, cash = 0, reasonNote = '', outcomePayload = {}) => {
    setActionLoadingId(`status_${orderId}`);
    try {
      const res = await fetch(`${apiBase}/orders/${orderId}/delivery-status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: newStatus,
          cash_amount: cash,
          failure_reason: reasonNote,
          ...outcomePayload
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`${t('statusUpdated')}`);
        fetchData();
      } else {
        Alert.alert(t('alertError'), data.error || 'Status update failed');
      }
    } catch (e) {
      Alert.alert(t('alertError'), t('networkError'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmDeliveryFailure = () => {
    if (!failureReason.trim()) {
      Alert.alert(t('alertError'), t('mandatoryReasonLabel'));
      return;
    }
    updateDeliveryStatus(selectedOrderId, 'delivery_failed', 0, failureReason.trim());
    setFailureModal(false);
    setSelectedOrderId(null);
    setFailureReason('');
  };

  const handleConfirmInventoryIssue = async () => {
    if (!inventoryIssueReason.trim()) {
      Alert.alert(t('alertError'), t('mandatoryReasonLabel'));
      return;
    }
    setActionLoadingId(`issue_${selectedOrderId}`);
    try {
      const res = await fetch(`${apiBase}/orders/${selectedOrderId}/handoff`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ handed_over: false, note: inventoryIssueReason.trim() })
      });
      if (res.ok) {
        showToast(lang === 'ar' ? 'تم تسجيل البلاغ بنجاح' : 'Staging issue recorded successfully');
        fetchData();
      } else {
        const data = await res.json();
        Alert.alert(t('alertError'), data.error || 'Failed to record issue');
      }
    } catch (e) {
      Alert.alert(t('alertError'), t('networkError'));
    } finally {
      setActionLoadingId(null);
      setInventoryIssueModal(false);
      setSelectedOrderId(null);
      setInventoryIssueReason('');
    }
  };

  const handleFinancePullout = (driver) => {
    const driverId = driver.delivery_guy_id || driver.id;
    const driverName = driver.delivery_guy_name || driver.name;
    const fullAmount = getDriverWallet(driverId).collection_balance;

    if (fullAmount <= 0) {
      Alert.alert(t('alertError'), lang === 'ar' ? 'لا توجد مبالغ نقدية للتصفية' : 'No cash collected to pull out.');
      return;
    }

    Alert.alert(
      lang === 'ar' ? 'تأكيد تصفية النقدية' : 'Confirm Cash Clearance',
      lang === 'ar'
        ? `هل تريد تصفية وإخلاء كامل المبلغ المجمع ($${fullAmount.toFixed(2)}) من المندوب ${dt(driverName)}؟`
        : `Clear full collection balance ($${fullAmount.toFixed(2)}) from ${dt(driverName)}?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirmPulloutBtn'),
          onPress: async () => {
            setActionLoadingId(`pullout_${driverId}`);
            try {
              const res = await fetch(`${apiBase}/wallets/collection/pullout`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  delivery_guy_id: driverId,
                  amount_to_pull: fullAmount,
                  notes: 'Full cash pullout clearance'
                })
              });
              const data = await res.json();
              if (res.ok) {
                showToast(lang === 'ar' ? `تم توريد $${fullAmount.toFixed(2)} بنجاح!` : `Cleared full $${fullAmount.toFixed(2)} cash balance!`);
                updateSharedWallet([driverId, driverName, driver.username], 0, 0, 0.00);
                fetchData();
              } else {
                Alert.alert(t('alertError'), data.error || 'Cash pullout failed');
              }
            } catch (e) {
              Alert.alert(t('alertError'), t('networkError'));
            } finally {
              setActionLoadingId(null);
            }
          }
        }
      ]
    );
  };

  const handleFinanceClearOrder = (orderId, trackingNumber, amount) => {
    const numericAmt = parseFloat(amount || 0);
    Alert.alert(
      lang === 'ar' ? 'تأكيد تسوية النقدية للشحنة' : 'Confirm Order Cash Settlement',
      lang === 'ar'
        ? `هل استلمت مبلغ ($${numericAmt.toFixed(2)}) الخاص بالشحنة #${trackingNumber}؟`
        : `Have you collected $${numericAmt.toFixed(2)} cash for order #${trackingNumber}?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: lang === 'ar' ? 'تأكيد الاستلام والتسوية' : 'Confirm Settlement',
          onPress: async () => {
            setActionLoadingId(`clearOrder_${orderId}`);
            try {
              const res = await fetch(`${apiBase}/wallets/collection/clear-order`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ order_id: orderId })
              });
              const data = await res.json();
              if (res.ok) {
                showToast(lang === 'ar' ? `تم تسوية $${numericAmt.toFixed(2)} للشحنة #${trackingNumber}` : `Cash of $${numericAmt.toFixed(2)} settled for #${trackingNumber}`);
                fetchData();
              } else {
                Alert.alert(t('alertError'), data.error || 'Failed to clear order cash');
              }
            } catch (e) {
              Alert.alert(t('alertError'), t('networkError'));
            } finally {
              setActionLoadingId(null);
            }
          }
        }
      ]
    );
  };

  const handleFinanceTopup = async () => {
    if (!targetDriver || !topupAmount) {
      Alert.alert(t('alertError'), 'Top-up amount is required');
      return;
    }
    const driverId = String(targetDriver.delivery_guy_id || targetDriver.id);
    const driverName = targetDriver.delivery_guy_name || targetDriver.name;
    const driverUser = targetDriver.username;
    const numericAmt = parseFloat(topupAmount) || 0;
    setActionLoadingId('topup');
    try {
      const res = await fetch(`${apiBase}/wallets/pocket/topup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          delivery_guy_id: driverId,
          amount: numericAmt,
          notes: topupNotes.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`${lang === 'ar' ? 'تم شحن' : 'Topped up'} $${numericAmt.toFixed(2)} ${lang === 'ar' ? 'للمندوب' : 'for'} ${dt(driverName)}`);

        // INSTANTLY UPDATE THE SINGLE GLOBAL WALLET OBJECT X FOR ALL SCREENS
        updateSharedWallet([driverId, driverName, driverUser], numericAmt, 0);

        setTopupModal(false);
        setTargetDriver(null);
        setTopupAmount('');
        setTopupNotes('');
        fetchData();
      } else {
        Alert.alert(t('alertError'), data.error || 'Pocket topup failed');
      }
    } catch (e) {
      Alert.alert(t('alertError'), t('networkError'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const submitExpense = async () => {
    if (!expenseAmount || !expenseReason.trim()) {
      Alert.alert(t('alertError'), t('mandatoryReasonLabel'));
      return;
    }
    const expAmt = parseFloat(expenseAmount) || 0;
    setActionLoadingId('expense');
    try {
      const res = await fetch(`${apiBase}/wallets/pocket/expense`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: expAmt,
          reason: expenseReason.trim(),
          order_id: expenseOrderId || undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`${t('expenseSuccess')} $${parseFloat(data.new_pocket_balance || 0).toFixed(2)}`);

        // INSTANTLY UPDATE THE SINGLE GLOBAL WALLET OBJECT X FOR ALL SCREENS
        if (user) {
          updateSharedWallet([user.id, user.username, user.name], 0, expAmt);
        }

        setExpenseModal(false);
        setExpenseAmount('');
        setExpenseReason('');
        setExpenseOrderId('');
        fetchData();
      } else {
        Alert.alert(t('alertError'), data.error || t('expenseFail'));
      }
    } catch (e) {
      Alert.alert(t('alertError'), t('networkError'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleInventoryHandoff = async (orderId) => {
    setActionLoadingId(`handoff_${orderId}`);
    try {
      const res = await fetch(`${apiBase}/orders/${orderId}/handoff`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ handed_over: true })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`${t('handoffSuccess')}`);
        fetchData();
      } else {
        if (data.error && data.error.includes('Photo proof required')) {
          const targetOrder = safeOrders.find(o => o.id === orderId);
          Alert.alert(
            lang === 'ar' ? '📸 صورة الإثبات مطلوبة' : '📸 Photo Proof Required',
            lang === 'ar'
              ? 'يجب التقاط وتوثيق صورة حالة الشحنة قبل تأكيد التسليم للمندوب.'
              : 'You must capture and attach a photo proof of the order condition before completing warehouse handoff.',
            [
              { text: lang === 'ar' ? 'إلغاء' : 'Cancel', style: 'cancel' },
              {
                text: lang === 'ar' ? '📷 التقاط صورة الآن' : '📷 Take Photo Now',
                onPress: () => {
                  if (targetOrder) setSelectedCameraOrder(targetOrder);
                  setCameraStage('inventory_handoff');
                  setCameraModal(true);
                }
              }
            ]
          );
        } else {
          Alert.alert(t('alertError'), data.error || t('handoffFail'));
        }
      }
    } catch (e) {
      Alert.alert(t('alertError'), t('handoffFail'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUndoHandoff = async (orderId) => {
    setActionLoadingId(`undo_${orderId}`);
    try {
      const res = await fetch(`${apiBase}/orders/${orderId}/undo-handoff`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast(lang === 'ar' ? '↩️ تم إلغاء التسليم وإرجاع الشحنة للمخزن' : '↩️ Handoff undone! Order returned to warehouse queue.');
        fetchData();
      } else {
        const d = await res.json();
        Alert.alert(t('alertError'), d.error || 'Failed to undo handoff');
      }
    } catch (e) {
      Alert.alert(t('alertError'), t('networkError'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteOrder = (orderId, trackingNum) => {
    Alert.alert(
      lang === 'ar' ? 'تأكيد حذف الشحنة' : 'Confirm Delete Order',
      lang === 'ar' ? `هل أنت متأكد من حذف الشحنة #${trackingNum} نهائياً؟` : `Are you sure you want to permanently delete order #${trackingNum}?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: lang === 'ar' ? 'حذف' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(`delete_${orderId}`);
            try {
              const res = await fetch(`${apiBase}/orders/${orderId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
              });
              if (res.ok) {
                showToast(lang === 'ar' ? 'تم حذف الشحنة بنجاح' : 'Order deleted successfully');
                fetchData();
              } else {
                const d = await res.json();
                Alert.alert(t('alertError'), d.error || 'Failed to delete order');
              }
            } catch (e) {
              Alert.alert(t('alertError'), t('networkError'));
            } finally {
              setActionLoadingId(null);
            }
          }
        }
      ]
    );
  };

  const openEditOrderModal = (order) => {
    setEditingOrderId(order.id);
    setOrderNumber(order.tracking_number || '');
    setClientAddress(order.client_address || '');
    setOrderAmount(order.order_amount ? String(order.order_amount) : '');
    setAssigneeId(order.delivery_guy_id || '');
    setCreateOrderModal(true);
  };

  const handleCreateOrder = async () => {
    if (!orderNumber.trim()) {
      Alert.alert(
        t('alertError'),
        lang === 'ar' ? 'رقم الشحنة / الطلب مطلوب!' : 'Order Number / Code is required!'
      );
      return;
    }
    if (!clientAddress.trim() || !orderAmount) {
      Alert.alert(t('alertError'), t('addressRequiredMsg'));
      return;
    }
    if (!assigneeId) {
      Alert.alert(
        t('alertError'),
        lang === 'ar' ? 'يجب تعيين مندوب توصيل أولاً قبل إسناد الشحنة!' : 'A delivery driver must be assigned before dispatching the order!'
      );
      return;
    }
    setActionLoadingId('createOrder');
    try {
      const isEditing = Boolean(editingOrderId);
      const url = isEditing ? `${apiBase}/orders/${editingOrderId}` : `${apiBase}/orders`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          tracking_number: orderNumber.trim() || undefined,
          client_address: clientAddress.trim(),
          order_amount: parseFloat(orderAmount) || 0.00,
          payment_type: paymentTypeInput,
          delivery_guy_id: assigneeId
        })
      });
      if (res.ok) {
        showToast(isEditing
          ? (lang === 'ar' ? 'تم تحديث بيانات الشحنة بنجاح!' : 'Order updated successfully!')
          : `${t('orderCreatedMsg')}`
        );
        setCreateOrderModal(false);
        setEditingOrderId(null);
        setOrderNumber('');
        setClientAddress('');
        setOrderAmount('');
        setAssigneeId('');
        fetchData();
      } else {
        const d = await res.json();
        Alert.alert(t('alertError'), d.error || 'Failed to save order');
      }
    } catch (e) {
      Alert.alert(t('alertError'), t('networkError'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleApproveManager = async (managerId) => {
    setActionLoadingId(`approve_${managerId}`);
    try {
      const res = await fetch(`${apiBase}/auth/approve-manager/${managerId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast(`${t('approvedMsg')}`);
        fetchData();
      }
    } catch (e) {
      Alert.alert(t('alertError'), t('networkError'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectManager = (managerId) => {
    Alert.alert(
      t('rejectConfirmTitle'),
      t('rejectConfirmBody'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('rejectAccount'),
          style: 'destructive',
          onPress: async () => {
            setActionLoadingId(`reject_${managerId}`);
            try {
              const res = await fetch(`${apiBase}/auth/reject-manager/${managerId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
              });
              if (res.ok) {
                showToast(`${t('rejectedMsg')}`);
                fetchData();
              }
            } catch (e) {
              Alert.alert(t('alertError'), t('networkError'));
            } finally {
              setActionLoadingId(null);
            }
          }
        }
      ]
    );
  };



  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('@remember_me');
      await AsyncStorage.removeItem('@auth_token');
      await AsyncStorage.removeItem('@auth_user');
    } catch (e) { }
    setUser(null);
    setToken(null);
    setOrders([]);
    setWalletSummary(null);
    setFinanceWallets([]);
    setDeliveryGuys([]);
    setExpensesBreakdown(null);
    setSharedWalletsMap({});
    setDriverOnline(false);
    setActiveTab('tab1');
    setUsername('');
    setPassword('');
    setConfirmPassword('');
  };

  // Filter & Deduplicate Active vs Historical Orders
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeDeliveryGuys = Array.isArray(deliveryGuys) ? deliveryGuys : [];

  // Robust safeFinanceWallets builder using the UNIFIED MASTER GLOBAL WALLET MAP X
  const safeFinanceWallets = safeDeliveryGuys.map(g => {
    const driverKey = g.delivery_guy_id || g.id || g.username || g.name;
    const w = getDriverWallet(driverKey);
    return {
      id: g.id || g.delivery_guy_id,
      delivery_guy_id: g.delivery_guy_id || g.id,
      name: g.name || g.delivery_guy_name,
      delivery_guy_name: g.delivery_guy_name || g.name,
      username: g.username,
      phone: g.phone,
      online_status: g.online_status,
      collection_balance: w.collection_balance,
      pocket_balance: w.pocket_balance,
      total_topped_up: w.total_topped_up,
      total_spent: w.total_spent
    };
  });

  const uniqueOrdersMap = new Map();
  safeOrders.forEach(o => {
    if (o && (o.id || o.tracking_number)) {
      uniqueOrdersMap.set(o.id || o.tracking_number, o);
    }
  });
  const uniqueOrders = Array.from(uniqueOrdersMap.values());

  const activeOrders = uniqueOrders.filter(o => o.status !== 'delivered' && o.status !== 'delivery_failed' && o.status !== 'cash_cleared');
  const todayDateStr = new Date().toDateString();
  const historyOrders = uniqueOrders.filter(o => {
    const isDone = o.status === 'delivered' || o.status === 'delivery_failed' || o.status === 'cash_cleared';
    if (!isDone) return false;
    const dateToCheck = o.delivered_at || o.updated_at || o.created_at;
    return new Date(dateToCheck).toDateString() === todayDateStr;
  });

  const inventoryQueue = safeOrders.filter(o => o.status === 'assigned' || o.status === 'notified_inventory');
  const inventoryIssues = safeOrders.filter(o => o.status === 'pickup_failed' || o.inventory_note);

  // System Grand Metrics for Executive Master Dashboard
  const grandCollectionCash = safeFinanceWallets.reduce((acc, w) => acc + parseFloat(w.collection_balance || 0), 0);
  const grandSpentExpenses = parseFloat(expensesBreakdown?.grand_total_spent || 0);

  // Exec Ops Board filtered orders (for drill-down filter strip)
  const execOpsFilteredOrders = safeOrders.filter(o => {
    if (execOpsFilter === 'active') return o.status !== 'delivered' && o.status !== 'delivery_failed' && o.status !== 'cash_cleared';
    if (execOpsFilter === 'transit') return o.status === 'in_transit';
    if (execOpsFilter === 'warehouse') return o.status === 'assigned' || o.status === 'notified_inventory' || o.status === 'handed_to_delivery';
    if (execOpsFilter === 'done') return o.status === 'delivered' || o.status === 'cash_cleared';
    if (execOpsFilter === 'failed') return o.status === 'delivery_failed';
    return true;
  });

  const filterAndSortOrders = (orderList) => {
    if (!Array.isArray(orderList)) return [];
    let result = [...orderList];

    if (searchQuery && searchQuery.trim() !== '') {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(o => {
        const tracking = String(o.tracking_number || '').toLowerCase();
        const address = String(o.client_address || '').toLowerCase();
        const driver = String(o.delivery_guy_name || '').toLowerCase();
        const amount = String(o.order_amount || '');
        return tracking.includes(q) || address.includes(q) || driver.includes(q) || amount.includes(q);
      });
    }

    result.sort((a, b) => {
      const dateA = new Date(a.created_at || a.delivered_at || 0).getTime();
      const dateB = new Date(b.created_at || b.delivered_at || 0).getTime();
      const amountA = parseFloat(a.order_amount || 0);
      const amountB = parseFloat(b.order_amount || 0);

      if (sortOrder === 'oldest') {
        return dateA - dateB;
      } else if (sortOrder === 'amount_desc') {
        return amountB - amountA;
      } else {
        return dateB - dateA;
      }
    });

    return result;
  };

  const renderSearchAndSortHeader = () => (
    <View style={{ marginBottom: 14 }}>
      <View style={[
        {
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderWidth: 1,
          borderColor: isDarkMode ? '#334155' : '#e2e8f0',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 4,
          elevation: 2
        }
      ]}>
        <Ionicons name="search" size={18} color="#94a3b8" style={{ marginHorizontal: 4 }} />
        <TextInput
          style={[
            { flex: 1, fontSize: 13, color: theme.text.color, paddingVertical: 4 },
            isRTL && styles.rtlText
          ]}
          placeholder={lang === 'ar' ? 'البحث برقم الشحنة، العنوان، المندوب...' : 'Search by tracking #, address, rider...'}
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <Text style={[theme.textMuted, { fontSize: 11, fontWeight: '700' }, isRTL && styles.rtlText]}>
          {lang === 'ar' ? 'ترتيب حسب:' : 'Sort:'}
        </Text>
        {[
          { id: 'newest', label_ar: 'الأحدث أولاً', label_en: 'Newest First' },
          { id: 'oldest', label_ar: 'الأقدم أولاً', label_en: 'Oldest First' },
          { id: 'amount_desc', label_ar: 'الأعلى مبلغا', label_en: 'Highest Amount' }
        ].map(item => {
          const isSelected = sortOrder === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 8,
                backgroundColor: isSelected ? '#2563eb' : (isDarkMode ? '#1e293b' : '#f1f5f9'),
                borderWidth: 1,
                borderColor: isSelected ? '#2563eb' : (isDarkMode ? '#334155' : '#cbd5e1')
              }}
              onPress={() => setSortOrder(item.id)}
            >
              <Text style={{ fontSize: 11, fontWeight: isSelected ? '800' : '600', color: isSelected ? '#ffffff' : (isDarkMode ? '#94a3b8' : '#64748b') }}>
                {lang === 'ar' ? item.label_ar : item.label_en}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  // AUTH SCREENS (not logged in)
  if (!user) {
    return (
      <SafeAreaView style={[styles.container, theme.bg]}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'flex-end', gap: 6, padding: 10 }}>
          <TouchableOpacity style={[styles.themeToggleBtn, theme.inputBg]} onPress={() => setIsDarkMode(!isDarkMode)}>
            <Text style={[styles.themeToggleText, theme.text]}>{isDarkMode ? t('lightMode') : t('darkMode')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.langBtn} onPress={toggleLanguage}>
            <Text style={styles.langBtnText}>{t('languageName')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.authHeader}>
          <Text style={[styles.brandTitle, { color: isDarkMode ? '#60a5fa' : '#1e40af' }]}>{t('brandName')}</Text>
          <Text style={[styles.brandSubtitle, theme.textMuted]}>
            {activeAuthTab === 'login' ? t('loginSubtitle') : t('registerSubtitle')}
          </Text>

          {__DEV__ && (
            <View style={[styles.hostBanner, theme.inputBg, { flexDirection: isRTL ? 'row-reverse' : 'row', marginTop: 10 }]}>
              <Text style={[styles.hostLabel, theme.text]}>{t('serverIpLabel')}</Text>
              <TextInput
                style={[styles.hostInput, theme.text]}
                value={serverHost}
                onChangeText={setServerHost}
                placeholder="192.168.1.37"
                autoCapitalize="none"
              />
            </View>
          )}
        </View>

        <ScrollView style={styles.formContainer} contentContainerStyle={{ paddingBottom: 50 }}>
          {authError ? (
            <View style={styles.errorBox}>
              <Text style={[styles.errorText, isRTL && styles.rtlText]}>{authError}</Text>
            </View>
          ) : null}

          {__DEV__ && (
            <View style={{ marginBottom: 14 }}>
              <Text style={[styles.inputLabel, theme.text, { fontSize: 11, fontWeight: '800' }, isRTL && styles.rtlText]}>
                {t('quickLoginsTitle')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
                {DEMO_ACCOUNTS.map((acc) => (
                  <TouchableOpacity
                    key={acc.username}
                    style={[styles.demoChip, { backgroundColor: acc.color }]}
                    onPress={() => {
                      setUsername(acc.username);
                      setPassword('Admin123!');
                      handleLogin(acc.username, 'Admin123!');
                    }}
                  >
                    <Text style={styles.demoChipText}>{acc.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {activeAuthTab === 'login' ? (
            <View style={[styles.card, theme.cardBg]}>
              <Text style={[styles.cardTitle, theme.text]}>{t('loginTitle')}</Text>

              <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{t('usernameLabel')}</Text>
              <TextInput
                style={[styles.input, theme.inputBg, theme.text, isRTL && styles.rtlText]}
                placeholder={t('usernamePlaceholder')}
                placeholderTextColor="#94a3b8"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />

              <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{t('passwordLabel')}</Text>
              <View style={[styles.passwordRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <TextInput
                  style={[styles.input, styles.passwordInput, theme.inputBg, theme.text, isRTL && styles.rtlText]}
                  placeholder={t('passwordPlaceholder')}
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity style={[styles.eyeBtn, isRTL ? { left: 12 } : { right: 12 }]} onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? "eye-outline" : "eye-off-outline"}
                    size={22}
                    color={isDarkMode ? "#94a3b8" : "#64748b"}
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.rememberRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                onPress={() => setRememberMe(!rememberMe)}
              >
                <Ionicons
                  name={rememberMe ? "checkbox" : "square-outline"}
                  size={22}
                  color={rememberMe ? "#2563eb" : (isDarkMode ? "#94a3b8" : "#64748b")}
                />
                <Text style={[styles.rememberText, theme.text]}>{t('rememberMeLabel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.primaryButton} onPress={() => handleLogin()} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t('signInBtn')}</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.switchAuthBtn, { borderColor: isDarkMode ? '#60a5fa' : '#2563eb', backgroundColor: isDarkMode ? 'rgba(96,165,250,0.12)' : 'rgba(37,99,235,0.08)' }]}
                onPress={() => { setActiveAuthTab('register'); setAuthError(''); }}
              >
                <Text style={[styles.switchAuthText, { color: isDarkMode ? '#60a5fa' : '#1d4ed8' }]}>
                  {t('dontHaveAccountLink')} {isRTL ? '←' : '→'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.card, theme.cardBg]}>
              <Text style={[styles.cardTitle, theme.text]}>{t('registerTitle')}</Text>

              <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{t('usernameLabel')} *</Text>
              <TextInput
                style={[styles.input, theme.inputBg, theme.text, isRTL && styles.rtlText]}
                placeholder={t('registerUsernamePlaceholder')}
                placeholderTextColor="#94a3b8"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />

              <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{t('fullNameLabel')} *</Text>
              <TextInput
                style={[styles.input, theme.inputBg, theme.text, isRTL && styles.rtlText]}
                placeholder={t('namePlaceholder')}
                placeholderTextColor="#94a3b8"
                value={name}
                onChangeText={setName}
              />

              <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{t('passwordLabel')} *</Text>
              <View style={[styles.passwordRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <TextInput
                  style={[styles.input, styles.passwordInput, theme.inputBg, theme.text, isRTL && styles.rtlText]}
                  placeholder={t('registerPasswordPlaceholder')}
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showRegPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity style={[styles.eyeBtn, isRTL ? { left: 12 } : { right: 12 }]} onPress={() => setShowRegPassword(!showRegPassword)}>
                  <Ionicons
                    name={showRegPassword ? "eye-outline" : "eye-off-outline"}
                    size={22}
                    color={isDarkMode ? "#94a3b8" : "#64748b"}
                  />
                </TouchableOpacity>
              </View>

              <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{t('confirmPasswordLabel')} *</Text>
              <View style={[styles.passwordRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <TextInput
                  style={[styles.input, styles.passwordInput, theme.inputBg, theme.text, isRTL && styles.rtlText]}
                  placeholder={t('confirmPasswordPlaceholder')}
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
                <TouchableOpacity style={[styles.eyeBtn, isRTL ? { left: 12 } : { right: 12 }]} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Ionicons
                    name={showConfirmPassword ? "eye-outline" : "eye-off-outline"}
                    size={22}
                    color={isDarkMode ? "#94a3b8" : "#64748b"}
                  />
                </TouchableOpacity>
              </View>

              {confirmPassword.length > 0 && (
                <Text style={{ color: password === confirmPassword ? '#10b981' : '#ef4444', fontSize: 12, marginTop: 4, textAlign: isRTL ? 'right' : 'left' }}>
                  {password === confirmPassword ? '' + (lang === 'ar' ? 'كلمتا المرور متطابقتان' : 'Passwords match') : '' + t('passwordMismatch')}
                </Text>
              )}

              <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{t('selectRoleLabel')}</Text>
              <View style={{
                borderRadius: 12, overflow: 'hidden',
                borderWidth: 1.5, borderColor: isDarkMode ? '#334155' : '#cbd5e1',
                backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc',
                marginBottom: 4
              }}>
                {[
                  { val: 'delivery_guy', label: t('roleDeliveryGuy') },
                  { val: 'supervisor', label: t('roleSupervisor') },
                  { val: 'inventory', label: t('roleInventory') },
                  { val: 'finance', label: t('roleFinance') },
                  { val: 'manager', label: t('roleManager') },
                ].map((r, idx, arr) => (
                  <TouchableOpacity
                    key={r.val}
                    onPress={() => setRole(r.val)}
                    style={{
                      flexDirection: isRTL ? 'row-reverse' : 'row',
                      alignItems: 'center',
                      paddingVertical: 13,
                      paddingHorizontal: 16,
                      backgroundColor: role === r.val
                        ? (isDarkMode ? '#2563eb' : '#2563eb')
                        : 'transparent',
                      borderBottomWidth: idx < arr.length - 1 ? 1 : 0,
                      borderBottomColor: isDarkMode ? '#334155' : '#e2e8f0',
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{
                      width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                      borderColor: role === r.val ? '#fff' : (isDarkMode ? '#475569' : '#94a3b8'),
                      backgroundColor: role === r.val ? '#fff' : 'transparent',
                      marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0,
                      alignItems: 'center', justifyContent: 'center'
                    }}>
                      {role === r.val && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563eb' }} />}
                    </View>
                    <Text style={{
                      fontSize: 14, fontWeight: role === r.val ? '700' : '500',
                      color: role === r.val ? '#ffffff' : (isDarkMode ? '#cbd5e1' : '#334155'),
                      textAlign: isRTL ? 'right' : 'left'
                    }}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.primaryButton} onPress={handleRegister} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t('registerBtn')}</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.switchAuthBtn, { borderColor: isDarkMode ? '#94a3b8' : '#64748b', backgroundColor: isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.08)' }]}
                onPress={() => { setActiveAuthTab('login'); setAuthError(''); }}
              >
                <Text style={[styles.switchAuthText, { color: isDarkMode ? '#f8fafc' : '#334155' }]}>
                  {isRTL ? '' : '← '}{t('alreadyHaveAccountLink')}{isRTL ? ' →' : ''}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <Modal visible={approvalModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, theme.cardBg]}>
              <Text style={[styles.modalTitle, { color: '#f59e0b' }]}>{lang === 'ar' ? 'في انتظار الموافقة' : 'Pending Approval'}</Text>
              <Text style={[theme.textMuted, { marginTop: 10, lineHeight: 22, textAlign: isRTL ? 'right' : 'left' }]}>
                {lang === 'ar'
                  ? 'تم تسجيل حسابك كمدير تنفيذي بنجاح. يرجى انتظار موافقة مدير تنفيذي آخر لتفعيل صلاحيات تسجيل الدخول.'
                  : 'Your Executive Manager account has been registered. Please wait for an existing Executive Manager to approve your access before signing in.'}
              </Text>
              <TouchableOpacity style={[styles.primaryButton, { marginTop: 20 }]} onPress={() => setApprovalModal(false)}>
                <Text style={styles.primaryButtonText}>{lang === 'ar' ? 'حسناً، فهمت' : 'Got It'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // Multi-Tab Navigation Configuration per Role
  const getTabConfig = () => {
    switch (user.role) {
      case 'delivery_guy':
        return [
          { id: 'tab1', icon: 'cube-outline', label: t('tabActiveRoutes'), badge: activeOrders.length },
          { id: 'tab2', icon: 'wallet-outline', label: t('tabWalletsExpenses') },
          { id: 'tab3', icon: 'time-outline', label: t('tabHistory'), badge: historyOrders.length }
        ];
      case 'supervisor':
        return [
          { id: 'tab1', icon: 'paper-plane-outline', label: t('tabDispatchBoard'), badge: activeOrders.length },
          { id: 'tab2', icon: 'people-outline', label: t('tabDriverRoster'), badge: safeDeliveryGuys.length },
          { id: 'tab3', icon: 'archive-outline', label: t('tabHistory') }
        ];
      case 'inventory':
        return [
          { id: 'tab1', icon: 'home-outline', label: t('tabWarehouseQueue'), badge: inventoryQueue.length },
          { id: 'tab2', icon: 'alert-circle-outline', label: t('tabStagingIssues'), badge: inventoryIssues.length }
        ];
      case 'finance':
        return [
          { id: 'tab1', icon: 'cash-outline', label: t('tabDriverWallets'), badge: safeFinanceWallets.length },
          { id: 'tab2', icon: 'receipt-outline', label: t('tabAuditHistory') }
        ];
      case 'manager':
        // Master Executive Control Center (5-Tab Read-Only Overview)
        return [
          { id: 'tab1', icon: 'pie-chart-outline', label: t('tabMasterOverview') },
          { id: 'tab2', icon: 'list-outline', label: t('tabOpsBoard'), badge: safeOrders.length },
          { id: 'tab3', icon: 'people-outline', label: t('tabDriverRoster'), badge: safeDeliveryGuys.length },
          { id: 'tab4', icon: 'receipt-outline', label: t('tabExpensesLog') },
          { id: 'tab5', icon: 'shield-checkmark-outline', label: t('tabApprovalsRoster'), badge: pendingManagers.length }
        ];
      default:
        return [];
    }
  };

  const tabs = getTabConfig();

  return (
    <SafeAreaView style={[styles.container, theme.bg]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {/* Top Header */}
      <View style={[styles.appHeader, theme.cardBg, { flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6 }]}>
        <View style={{ flex: 1, minWidth: 120, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
          <Text style={[styles.headerUser, theme.text]}>{dt(user.name)}</Text>
          <Text style={styles.headerRoleBadge}>{t(user.role) || user.role.replace('_', ' ').toUpperCase()}</Text>
        </View>

        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <TouchableOpacity style={styles.langBtn} onPress={toggleLanguage}>
            <Text style={styles.langBtnText}>{t('languageName')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.themeToggleBtn, theme.inputBg]} onPress={() => setIsDarkMode(!isDarkMode)}>
            <Text style={[styles.themeToggleText, theme.text]}>{isDarkMode ? t('lightMode') : t('darkMode')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>{t('logout')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {notification ? (
        <View style={styles.toastBanner}>
          <Text style={styles.toastText}>{notification}</Text>
        </View>
      ) : null}

      {/* WORKSTATION CONTENT */}
      <ScrollView style={{ flex: 1, padding: 15 }} contentContainerStyle={{ paddingBottom: 90 }}>

        {/* ── ROLE 1: DELIVERY GUY ── */}
        {user.role === 'delivery_guy' && (
          <View>
            <View style={[styles.driverStatusCard, { backgroundColor: !driverOnline ? '#475569' : (activeOrders.length > 0 ? '#059669' : '#2563eb'), flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 10 }]}>
              <View style={{ flex: 1, minWidth: 150, paddingRight: isRTL ? 0 : 8, paddingLeft: isRTL ? 8 : 0 }}>
                <Text style={[styles.driverStatusTitle, isRTL && styles.rtlText]}>
                  {driverOnline ? (lang === 'ar' ? 'حالة التواجد والخدمة' : 'Active Duty & Order Status') : (lang === 'ar' ? '⭕ خارج الخدمة (غير متصل)' : '⭕ Offline Status')}
                </Text>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <View style={[styles.statusDot, { backgroundColor: driverOnline ? '#10b981' : '#cbd5e1' }]} />
                  <Text style={[styles.driverStatusText, isRTL && styles.rtlText, { fontWeight: '800' }]} numberOfLines={1}>
                    {driverOnline
                      ? (activeOrders.length > 0
                        ? (lang === 'ar' ? `الشحنة الحالية: ${tStatus(activeOrders[0].status)}` : `Active Order: ${tStatus(activeOrders[0].status)}`)
                        : (lang === 'ar' ? 'جاهز للتوصيل — لا توجد شحنات نشطة' : 'Ready — No Active Deliveries'))
                      : t('youAreOffline')}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.toggleStatusBtn, { backgroundColor: driverOnline ? '#ef4444' : '#10b981', opacity: actionLoadingId === 'toggleDriverStatus' ? 0.7 : 1 }]}
                disabled={actionLoadingId === 'toggleDriverStatus'}
                onPress={toggleDriverStatus}
              >
                {actionLoadingId === 'toggleDriverStatus' ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.toggleStatusBtnText}>
                    {driverOnline ? t('goOffline') : t('goOnline')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* TAB 1: Active Routes */}
            {activeTab === 'tab1' && (
              <View>
                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>{t('assignedDeliveries')}</Text>
                {renderSearchAndSortHeader()}
                {filterAndSortOrders(activeOrders).length === 0 ? (
                  <Text style={[styles.emptyText, theme.textMuted]}>{t('noDeliveries')}</Text>
                ) : (
                  filterAndSortOrders(activeOrders).map((item) => {
                    const isExpanded = expandedCardId === item.id;
                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.orderCard,
                          theme.cardBg,
                          styles.statCardAccentAmber,
                          { padding: 16, borderRadius: 18, marginBottom: 14 }
                        ]}
                      >
                        {/* Accordion Card Header - Tap to Expand/Collapse */}
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => setExpandedCardId(isExpanded ? null : item.id)}
                        >
                          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={{ backgroundColor: isDarkMode ? '#1e293b' : '#eff6ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#bfdbfe' }}>
                                <Text style={{ color: '#2563eb', fontSize: 13, fontWeight: '900' }}>
                                  #{item.tracking_number || item.id?.slice(0, 8) || 'ORDER'}
                                </Text>
                              </View>
                              <Text style={[{ color: '#059669', fontSize: 15, fontWeight: '900' }]}>
                                EGP {parseFloat(item.order_amount || 0).toFixed(2)}
                              </Text>
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.statusTag, { backgroundColor: getStatusColor(item.status) }]}>{tStatus(item.status)}</Text>
                              <Ionicons name={isExpanded ? "chevron-up-circle" : "chevron-down-circle"} size={22} color={isDarkMode ? "#94a3b8" : "#64748b"} />
                            </View>
                          </View>

                          <Text style={[theme.text, isRTL && styles.rtlText, { fontSize: 14, fontWeight: '600', lineHeight: 20 }]} numberOfLines={isExpanded ? 3 : 1}>
                            {dt(item.client_address)}
                          </Text>
                        </TouchableOpacity>

                        {/* Collapsible Action Drawer (Expanded State) */}
                        {isExpanded && (
                          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: isDarkMode ? '#334155' : '#f1f5f9', gap: 10 }}>
                            <TouchableOpacity
                              style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 }}
                              onPress={() => openOrderAuditModal(item)}
                            >
                              <Ionicons name="document-text-outline" size={16} color="#6366f1" />
                              <Text style={{ color: '#6366f1', fontSize: 12, fontWeight: '800' }}>
                                {lang === 'ar' ? 'عرض مسار وسجل الشحنة بالكامل والوسائط' : 'View Full Journey & Media Audit'}
                              </Text>
                            </TouchableOpacity>

                            {item.status === 'assigned' || item.status === 'notified_inventory' ? (
                              <TouchableOpacity
                                style={[styles.actionBtn, { backgroundColor: '#7c3aed', borderRadius: 12 }]}
                                onPress={() => {
                                  Alert.alert(
                                    t('pickupGoToInventory'),
                                    t('pickupGoToInventoryMsg'),
                                    [{ text: lang === 'ar' ? 'حسناً، فهمت' : 'OK, Got It', style: 'default' }]
                                  );
                                }}
                              >
                                <Text style={styles.actionBtnText}>{t('pickupFromWarehouse')}</Text>
                              </TouchableOpacity>
                            ) : null}

                            {item.status === 'handed_to_delivery' ? (
                              <TouchableOpacity
                                style={[styles.actionBtn, { backgroundColor: '#2563eb', borderRadius: 12 }]}
                                onPress={() => updateDeliveryStatus(item.id, 'in_transit')}
                              >
                                <Text style={styles.actionBtnText}>{t('startTransit')}</Text>
                              </TouchableOpacity>
                            ) : null}

                            {item.status === 'in_transit' ? (
                              <View style={{ gap: 8 }}>
                                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8 }}>
                                  <TouchableOpacity
                                    style={[styles.actionBtn, { backgroundColor: '#10b981', flex: 1, borderRadius: 10 }]}
                                    onPress={() => {
                                      setSelectedOrderForOutcome(item);
                                      setDeliveredAmountInput(item.order_amount ? String(item.order_amount) : '');
                                      setReturnedAmountInput('0.00');
                                      setReturnNotesInput('');
                                      setOutcomeStep(1);
                                      setOutcomeModal(true);
                                    }}
                                  >
                                    <Text style={styles.actionBtnText}>{lang === 'ar' ? 'النتيجة' : 'Outcome'}</Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    style={[styles.actionBtn, { backgroundColor: '#2563eb', flex: 1, borderRadius: 10 }]}
                                    onPress={() => {
                                      setSelectedOrderForPayment(item);
                                      setPaymentAmountInput(item.order_amount ? String(item.order_amount) : '');
                                      setPaymentModal(true);
                                    }}
                                  >
                                    <Text style={styles.actionBtnText}>{lang === 'ar' ? 'تحصيل' : 'Payment'}</Text>
                                  </TouchableOpacity>
                                </View>

                                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8 }}>
                                  <TouchableOpacity
                                    style={[styles.actionBtn, { backgroundColor: '#7c3aed', flex: 1, borderRadius: 10 }]}
                                    onPress={() => {
                                      setSelectedCameraOrder(item);
                                      setCameraModal(true);
                                    }}
                                  >
                                    <Text style={styles.actionBtnText}>{lang === 'ar' ? 'صورة إثبات' : 'Photo Proof'}</Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    style={[styles.actionBtn, { backgroundColor: '#ef4444', flex: 1, borderRadius: 10 }]}
                                    onPress={() => {
                                      setSelectedOrderId(item.id);
                                      setFailureModal(true);
                                    }}
                                  >
                                    <Text style={styles.actionBtnText}>{lang === 'ar' ? 'فشل التسليم' : 'Failed'}</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ) : null}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* TAB 2: Wallets & Expenses */}
            {activeTab === 'tab2' && (
              <View>
                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>
                  {t('collectionWallet')} & {t('pocketWallet')}
                </Text>
                {(() => {
                  const driverWallet = getDriverWallet(user.id || user.username);
                  const colVal = driverWallet.collection_balance;
                  const pockVal = driverWallet.pocket_balance;

                  return (
                    <View style={[styles.walletRow, { flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 10 }]}>
                      <View style={[styles.walletCard, { backgroundColor: '#059669', flex: 1, minWidth: 140 }]}>
                        <Text style={[styles.walletLabel, isRTL && styles.rtlText]}>{t('collectionWallet')}</Text>
                        <Text style={[styles.walletValue, isRTL && styles.rtlText]}>${colVal.toFixed(2)}</Text>
                        <Text style={[styles.walletSub, isRTL && styles.rtlText]}>{t('cashLiability')}</Text>
                      </View>
                      <View style={[styles.walletCard, { backgroundColor: pockVal < 0 ? '#dc2626' : '#2563eb', flex: 1, minWidth: 140 }]}>
                        <Text style={[styles.walletLabel, isRTL && styles.rtlText]}>{t('pocketWallet')}</Text>
                        <Text style={[styles.walletValue, isRTL && styles.rtlText]}>${pockVal.toFixed(2)}</Text>
                        <Text style={[styles.walletSub, isRTL && styles.rtlText]}>{t('fuelExpenses')}</Text>
                      </View>
                    </View>
                  );
                })()}

                <TouchableOpacity style={styles.expenseBtn} onPress={() => setExpenseModal(true)}>
                  <Text style={styles.expenseBtnText}>{t('logExpenseBtn')}</Text>
                </TouchableOpacity>

                <Text style={[styles.sectionTitle, theme.text, { marginTop: 22 }, isRTL && styles.rtlText]}>
                  {lang === 'ar' ? 'سجل المصاريف الأخيرة' : 'Recent Expenses Log'}
                </Text>
                {!walletSummary?.expenses || walletSummary.expenses.length === 0 ? (
                  <Text style={[styles.emptyText, theme.textMuted]}>{lang === 'ar' ? 'لا توجد مصاريف مسجلة' : 'No expenses logged yet.'}</Text>
                ) : (
                  walletSummary.expenses.map((exp) => (
                    <View key={exp.id} style={[styles.orderCard, theme.cardBg, styles.statCardAccentPurple, { paddingVertical: 10 }]}>
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[{ color: '#ef4444', fontWeight: '900', fontSize: 16 }]}>-${parseFloat(exp.amount).toFixed(2)}</Text>
                        <Text style={[theme.textMuted, { fontSize: 11 }]}>{new Date(exp.created_at).toLocaleTimeString()}</Text>
                      </View>
                      {exp.order_tracking_number ? (
                        <Text style={[{ color: '#2563eb', fontWeight: '800', fontSize: 12, marginTop: 4 }, isRTL && styles.rtlText]}>
                          {lang === 'ar' ? 'خاص بالشحنة:' : 'Assigned Order:'} #{exp.order_tracking_number}
                        </Text>
                      ) : null}
                      <Text style={[theme.text, { fontWeight: '700', marginTop: 4 }, isRTL && styles.rtlText]}>{dt(exp.reason)}</Text>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* TAB 3: Delivery History */}
            {activeTab === 'tab3' && (
              <View>
                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>{t('tabHistory')}</Text>
                {renderSearchAndSortHeader()}
                {filterAndSortOrders(historyOrders).length === 0 ? (
                  <Text style={[styles.emptyText, theme.textMuted]}>{t('noHistory')}</Text>
                ) : (
                  filterAndSortOrders(historyOrders).map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.85}
                      style={[styles.orderCard, theme.cardBg, item.status === 'delivered' || item.status === 'cash_cleared' ? styles.statCardAccentEmerald : styles.statCardAccentPurple]}
                      onPress={() => openOrderAuditModal(item)}
                    >
                      <View style={[styles.orderHeader, { flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6 }]}>
                        <Text style={[styles.trackingNum, theme.text]}>#{item.tracking_number}</Text>
                        <Text style={[styles.statusTag, { backgroundColor: getStatusColor(item.status) }]}>{tStatus(item.status)}</Text>
                      </View>
                      <Text style={[styles.orderDetail, theme.text, isRTL && styles.rtlText, { fontSize: 14, fontWeight: '700', marginTop: 4 }]}>
                        {dt(item.client_address)}
                      </Text>
                      <Text style={[{ color: '#10b981', fontSize: 14, fontWeight: '800', marginTop: 3 }, isRTL && styles.rtlText]}>
                        ${parseFloat(item.order_amount || 0).toFixed(2)}
                      </Text>
                      <Text style={[{ color: '#2563eb', fontSize: 12, fontWeight: '700', marginTop: 6 }, isRTL && styles.rtlText]}>
                        {lang === 'ar' ? 'اضغط لعرض مسار الشحنة بالكامل' : 'Tap to view full order journey'}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </View>
        )}

        {/* ── ROLE 2: SUPERVISOR (Polished UI & Cards) ── */}
        {user.role === 'supervisor' && (
          <View>
            {activeTab === 'tab1' && (
              <View>
                {/* Supervisor High-Contrast Operations Overview Cards */}
                <View style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <Text style={[styles.sectionTitle, theme.text, { fontSize: 17, marginBottom: 0 }, isRTL && styles.rtlText]}>
                      {lang === 'ar' ? 'مركز قيادة العمليات' : 'Supervisor Operations Command'}
                    </Text>
                  </View>

                  {/* 2x2 KPI Command Cards */}
                  <View style={{ gap: 10, marginBottom: 16 }}>
                    {/* Row 1 */}
                    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10 }}>
                      <TouchableOpacity onPress={() => openSupervisorCard('active')} activeOpacity={0.85} style={[styles.statCardMini, { backgroundColor: '#2563eb', flex: 1, padding: 14, borderRadius: 14 }]}>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800' }}>{lang === 'ar' ? 'النشطة' : 'ACTIVE'}</Text>
                          <Ionicons name="cube-outline" size={18} color="rgba(255,255,255,0.8)" />
                        </View>
                        <Text style={[styles.statCardMiniVal, { fontSize: 24, marginTop: 4 }]}>{activeOrders.length}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 }}>{lang === 'ar' ? 'شحنات نشطة' : 'Active Orders'}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, marginTop: 3 }}>{lang === 'ar' ? 'اضغط للتفاصيل' : 'Tap for details'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => openSupervisorCard('transit')} activeOpacity={0.85} style={[styles.statCardMini, { backgroundColor: '#d97706', flex: 1, padding: 14, borderRadius: 14 }]}>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800' }}>{lang === 'ar' ? 'بالطريق' : 'TRANSIT'}</Text>
                          <Ionicons name="car-outline" size={18} color="rgba(255,255,255,0.8)" />
                        </View>
                        <Text style={[styles.statCardMiniVal, { fontSize: 24, marginTop: 4 }]}>{safeOrders.filter(o => o.status === 'in_transit').length}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 }}>{lang === 'ar' ? 'بالطريق' : 'In Transit'}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, marginTop: 3 }}>{lang === 'ar' ? 'اضغط للتفاصيل' : 'Tap for details'}</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Row 2 */}
                    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10 }}>
                      <TouchableOpacity onPress={() => openSupervisorCard('done')} activeOpacity={0.85} style={[styles.statCardMini, { backgroundColor: '#059669', flex: 1, padding: 14, borderRadius: 14 }]}>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800' }}>{lang === 'ar' ? 'المكتملة' : 'DONE'}</Text>
                          <Ionicons name="checkmark-circle-outline" size={18} color="rgba(255,255,255,0.8)" />
                        </View>
                        <Text style={[styles.statCardMiniVal, { fontSize: 24, marginTop: 4 }]}>{safeOrders.filter(o => o.status === 'delivered' || o.status === 'cash_cleared').length}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 }}>{lang === 'ar' ? 'مكتملة' : 'Completed'}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, marginTop: 3 }}>{lang === 'ar' ? 'اضغط للتفاصيل' : 'Tap for details'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => openSupervisorCard('drivers')} activeOpacity={0.85} style={[styles.statCardMini, { backgroundColor: '#7c3aed', flex: 1, padding: 14, borderRadius: 14 }]}>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800' }}>{lang === 'ar' ? 'السائقين' : 'DRIVERS'}</Text>
                          <Ionicons name="people-outline" size={18} color="rgba(255,255,255,0.8)" />
                        </View>
                        <Text style={[styles.statCardMiniVal, { fontSize: 24, marginTop: 4 }]}>{safeDeliveryGuys.filter(g => g.online_status === 'online').length}/{safeDeliveryGuys.length}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 }}>{lang === 'ar' ? 'متصلون' : 'Online'}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, marginTop: 3 }}>{lang === 'ar' ? 'اضغط للتفاصيل' : 'Tap for details'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Primary Dispatch Action Button */}
                  <TouchableOpacity
                    activeOpacity={0.88}
                    style={{
                      backgroundColor: '#2563eb',
                      paddingVertical: 14,
                      paddingHorizontal: 20,
                      borderRadius: 14,
                      flexDirection: isRTL ? 'row-reverse' : 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      marginBottom: 20,
                      shadowColor: '#2563eb',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      elevation: 4
                    }}
                    onPress={() => setCreateOrderModal(true)}
                  >
                    <Ionicons name="add-circle" size={22} color="#ffffff" />
                    <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '800' }}>
                      {t('dispatchOrder')}
                    </Text>
                  </TouchableOpacity>
                </View>


                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>{t('allOrders')}</Text>
                {renderSearchAndSortHeader()}
                {filterAndSortOrders(activeOrders).length === 0 ? (
                  <Text style={[styles.emptyText, theme.textMuted]}>{t('noDeliveries')}</Text>
                ) : (
                  filterAndSortOrders(activeOrders).map((o) => (
                    <TouchableOpacity
                      key={o.id}
                      activeOpacity={0.85}
                      style={[styles.orderCard, theme.cardBg, styles.statCardAccentBlue, { padding: 16, borderRadius: 14, marginBottom: 12 }]}
                      onPress={() => openOrderAuditModal(o)}
                    >
                      <View style={[styles.orderHeader, { flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6 }]}>
                        <Text style={[styles.trackingNum, theme.text, { fontSize: 16 }]}>#{o.tracking_number}</Text>
                        <Text style={[styles.statusTag, { backgroundColor: getStatusColor(o.status) }]}>{tStatus(o.status)}</Text>
                      </View>

                      <View style={{ marginTop: 8, gap: 4 }}>
                        <Text style={[styles.orderDetail, theme.text, isRTL && styles.rtlText, { fontSize: 14, fontWeight: '700' }]}>
                          {dt(o.client_address)}
                        </Text>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                          <Text style={[{ color: '#059669', fontSize: 15, fontWeight: '900' }, isRTL && styles.rtlText]}>
                            ${parseFloat(o.order_amount || 0).toFixed(2)}
                          </Text>
                          {o.delivery_guy_name ? (
                            <Text style={[{ color: '#2563eb', fontSize: 12, fontWeight: '700' }, isRTL && styles.rtlText]}>
                               Rider: {dt(o.delivery_guy_name)}
                            </Text>
                          ) : (
                            <Text style={[{ color: '#f59e0b', fontSize: 12, fontWeight: '700' }, isRTL && styles.rtlText]}>
                              Unassigned Rider
                            </Text>
                          )}
                        </View>
                      </View>

                      <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: isDarkMode ? '#334155' : '#e2e8f0', flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={{ backgroundColor: '#2563eb', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          onPress={(e) => { e.stopPropagation(); openEditOrderModal(o); }}
                        >
                          <Ionicons name="create-outline" size={14} color="#fff" />
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{lang === 'ar' ? 'تعديل' : 'Edit'}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={{ backgroundColor: '#ef4444', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          onPress={(e) => { e.stopPropagation(); handleDeleteOrder(o.id, o.tracking_number); }}
                        >
                          <Ionicons name="trash-outline" size={14} color="#fff" />
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{lang === 'ar' ? 'حذف' : 'Delete'}</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: isDarkMode ? '#334155' : '#e2e8f0', flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: '#2563eb', fontSize: 12, fontWeight: '800' }}>
                          {lang === 'ar' ? 'عرض تتبع رحلة الشحنة' : 'View Action Audit Log'}
                        </Text>
                        <Text style={[theme.textMuted, { fontSize: 11 }]}>
                          ⏱️ {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {/* TAB 2: Driver Roster */}
            {activeTab === 'tab2' && (
              <View>
                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>{t('tabDriverRoster')}</Text>
                {safeDeliveryGuys.length === 0 ? (
                  <Text style={[styles.emptyText, theme.textMuted]}>{t('noDeliveries')}</Text>
                ) : safeDeliveryGuys.map((g) => (
                  <TouchableOpacity
                    key={g.id || g.delivery_guy_id}
                    activeOpacity={0.85}
                    style={[styles.orderCard, theme.cardBg, styles.statCardAccentEmerald, { padding: 16, borderRadius: 14 }]}
                    onPress={() => openDriverStatsModal(g)}
                  >
                    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 140 }}>
                        <View style={[styles.pulseOnline, { backgroundColor: g.online_status === 'online' ? '#10b981' : '#6b7280' }]} />
                        <Text style={[styles.clientName, theme.text, { fontSize: 15 }]}>{dt(g.name || g.delivery_guy_name)} (@{g.username || 'driver'})</Text>
                      </View>
                      <Text style={[styles.statusTag, { backgroundColor: g.online_status === 'online' ? '#10b981' : '#6b7280' }]}>
                        {g.online_status === 'online' ? t('youAreOnline') : t('youAreOffline')}
                      </Text>
                    </View>
                    <Text style={[{ color: '#2563eb', fontSize: 12, fontWeight: '800', marginTop: 8 }, isRTL && styles.rtlText]}>
                      {lang === 'ar' ? 'اضغط لعرض إحصائيات الأداء وميزانية العهدة ' : 'Tap to view performance stats & wallet budget '}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* TAB 3: History */}
            {activeTab === 'tab3' && (
              <View>
                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>{t('tabHistory')}</Text>
                {renderSearchAndSortHeader()}
                {filterAndSortOrders(historyOrders).length === 0 ? (
                  <Text style={[styles.emptyText, theme.textMuted]}>{t('noHistory')}</Text>
                ) : (
                  filterAndSortOrders(historyOrders).map((o) => (
                    <TouchableOpacity
                      key={o.id}
                      activeOpacity={0.85}
                      style={[styles.orderCard, theme.cardBg, o.status === 'delivered' || o.status === 'cash_cleared' ? styles.statCardAccentEmerald : styles.statCardAccentPurple, { padding: 16 }]}
                      onPress={() => openOrderAuditModal(o)}
                    >
                      <View style={[styles.orderHeader, { flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6 }]}>
                        <Text style={[styles.trackingNum, theme.text]}>#{o.tracking_number}</Text>
                        <Text style={[styles.statusTag, { backgroundColor: getStatusColor(o.status) }]}>{tStatus(o.status)}</Text>
                      </View>
                      <Text style={[styles.orderDetail, theme.text, isRTL && styles.rtlText, { fontSize: 14, fontWeight: '700', marginTop: 4 }]}>
                        {dt(o.client_address)}
                      </Text>
                      <Text style={[{ color: '#10b981', fontSize: 14, fontWeight: '800', marginTop: 3 }, isRTL && styles.rtlText]}>
                        ${parseFloat(o.order_amount || 0).toFixed(2)}
                      </Text>
                      <Text style={[{ color: '#2563eb', fontSize: 12, fontWeight: '700', marginTop: 6 }, isRTL && styles.rtlText]}>
                        {lang === 'ar' ? 'اضغط لعرض مسار الشحنة بالكامل' : 'Tap to view full order journey'}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </View>
        )}

        {/* ── ROLE 3: INVENTORY ── */}
        {user.role === 'inventory' && (
          <View>
            {/* TAB 1: Warehouse Queue (Pending Handoff & Handed Over) */}
            {activeTab === 'tab1' && (
              <View>
                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>{t('warehouseQueue')}</Text>
                {renderSearchAndSortHeader()}
                {filterAndSortOrders(inventoryQueue).length === 0 ? (
                  <Text style={[styles.emptyText, theme.textMuted]}>{t('noDeliveries')}</Text>
                ) : filterAndSortOrders(inventoryQueue).map((o) => (
                  <TouchableOpacity
                    key={o.id}
                    activeOpacity={0.85}
                    style={[styles.orderCard, theme.cardBg, o.status === 'handed_to_delivery' ? styles.statCardAccentEmerald : styles.statCardAccentAmber]}
                    onPress={() => openOrderAuditModal(o)}
                  >
                    <View style={[styles.orderHeader, { flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6 }]}>
                      <Text style={[styles.trackingNum, theme.text, { fontSize: 18 }]}>#{o.tracking_number}</Text>
                      <Text style={[styles.statusTag, { backgroundColor: getStatusColor(o.status) }]}>{tStatus(o.status)}</Text>
                    </View>
                    <Text style={[styles.orderDetail, theme.text, isRTL && styles.rtlText, { fontSize: 14, fontWeight: '700', marginTop: 4 }]}>
                      {dt(o.client_address)}
                    </Text>
                    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <Text style={[{ color: '#10b981', fontSize: 14, fontWeight: '800' }, isRTL && styles.rtlText]}>
                        ${parseFloat(o.order_amount || 0).toFixed(2)}
                      </Text>
                      {o.delivery_guy_name ? (
                        <Text style={[{ color: '#2563eb', fontSize: 12, fontWeight: '700' }, isRTL && styles.rtlText]}>
                           Rider: {dt(o.delivery_guy_name)}
                        </Text>
                      ) : null}
                    </View>

                    <Text style={[{ color: '#2563eb', fontSize: 12, fontWeight: '700', marginTop: 6 }, isRTL && styles.rtlText]}>
                      {lang === 'ar' ? 'اضغط لعرض مسار الشحنة بالكامل' : 'Tap to view full order journey'}
                    </Text>

                    {o.status === 'handed_to_delivery' ? (
                      <View style={{ marginTop: 10 }}>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#dc2626' }]}
                          onPress={() => handleUndoHandoff(o.id)}
                          disabled={actionLoadingId === `undo_${o.id}`}
                        >
                          <Text style={styles.actionBtnText}>
                            {actionLoadingId === `undo_${o.id}` ? '...' : (lang === 'ar' ? '↩️ تراجع عن التسليم للمندوب' : '↩️ Undo Handoff')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{ gap: 8, marginTop: 10 }}>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8 }}>
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#f59e0b', flex: 1 }]}
                            onPress={() => handleInventoryHandoff(o.id)}
                          >
                            <Text style={styles.actionBtnText}>{t('confirmHandoff')}</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#7c3aed', flex: 1 }]}
                            onPress={() => {
                              setSelectedCameraOrder(o);
                              setCameraStage('inventory_handoff');
                              setCameraModal(true);
                            }}
                          >
                            <Text style={styles.actionBtnText}>{lang === 'ar' ? '📷 تصوير الشحنة' : '📷 Photo'}</Text>
                          </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                          onPress={() => {
                            setSelectedOrderId(o.id);
                            setInventoryIssueModal(true);
                          }}
                        >
                          <Text style={styles.actionBtnText}>{t('reportInventoryIssue')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* TAB 2: All System Orders with Status Filter */}
            {activeTab === 'tab2' && (
              <View>
                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>
                  {lang === 'ar' ? 'جميع شحنات النظام والتصفيات' : 'All System Orders & Statuses'}
                </Text>

                {/* Filter Chip Bar */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
                  {[
                    { id: 'all', label: lang === 'ar' ? 'الكل' : 'All', count: safeOrders.length },
                    { id: 'pending', label: lang === 'ar' ? 'بانتظار التسليم' : 'Queue (Pending)', count: safeOrders.filter(o => o.status === 'assigned' || o.status === 'notified_inventory' || o.status === 'created').length },
                    { id: 'handed', label: lang === 'ar' ? 'تم تسليمها للمندوب' : 'Handed Over', count: safeOrders.filter(o => o.status === 'handed_to_delivery').length },
                    { id: 'issues', label: lang === 'ar' ? 'بلاغات ومشاكل' : 'Issues / Failed', count: safeOrders.filter(o => o.status === 'pickup_failed' || o.inventory_note).length },
                    { id: 'completed', label: lang === 'ar' ? 'مكتملة ومسلمة' : 'Delivered / Done', count: safeOrders.filter(o => o.status === 'delivered' || o.status === 'cash_cleared' || o.status === 'in_transit').length },
                  ].map(f => (
                    <TouchableOpacity
                      key={f.id}
                      style={{
                        backgroundColor: inventoryFilter === f.id ? '#2563eb' : (isDarkMode ? '#334155' : '#e2e8f0'),
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        borderRadius: 20,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6
                      }}
                      onPress={() => setInventoryFilter(f.id)}
                    >
                      <Text style={{ color: inventoryFilter === f.id ? '#ffffff' : theme.text.color, fontWeight: '700', fontSize: 13 }}>
                        {f.label}
                      </Text>
                      <View style={{
                        backgroundColor: inventoryFilter === f.id ? 'rgba(255,255,255,0.3)' : (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 10
                      }}>
                        <Text style={{ color: inventoryFilter === f.id ? '#ffffff' : theme.text.color, fontSize: 11, fontWeight: '900' }}>
                          {f.count}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {(() => {
                  const filtered = safeOrders.filter(o => {
                    if (inventoryFilter === 'pending') return o.status === 'assigned' || o.status === 'notified_inventory' || o.status === 'created';
                    if (inventoryFilter === 'handed') return o.status === 'handed_to_delivery';
                    if (inventoryFilter === 'issues') return o.status === 'pickup_failed' || o.inventory_note;
                    if (inventoryFilter === 'completed') return o.status === 'delivered' || o.status === 'cash_cleared' || o.status === 'in_transit';
                    return true;
                  });

                  return filtered.length === 0 ? (
                    <Text style={[styles.emptyText, theme.textMuted]}>{lang === 'ar' ? 'لا توجد شحنات مطابقة لهذا التصفية' : 'No orders found matching this filter.'}</Text>
                  ) : filtered.map(o => (
                    <TouchableOpacity
                      key={o.id}
                      activeOpacity={0.85}
                      style={[styles.orderCard, theme.cardBg, { padding: 14, marginBottom: 10 }]}
                      onPress={() => openOrderAuditModal(o)}
                    >
                      <View style={[styles.orderHeader, { flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6 }]}>
                        <Text style={[styles.trackingNum, theme.text, { fontSize: 16 }]}>#{o.tracking_number}</Text>
                        <Text style={[styles.statusTag, { backgroundColor: getStatusColor(o.status) }]}>{tStatus(o.status)}</Text>
                      </View>

                      <Text style={[styles.orderDetail, theme.text, isRTL && styles.rtlText, { fontSize: 14, fontWeight: '700', marginTop: 4 }]}>
                        {dt(o.client_address)}
                      </Text>

                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', marginTop: 4 }}>
                        <Text style={[{ color: '#059669', fontSize: 14, fontWeight: '900' }, isRTL && styles.rtlText]}>
                          ${parseFloat(o.order_amount || 0).toFixed(2)}
                        </Text>
                        {o.delivery_guy_name ? (
                          <Text style={[{ color: '#2563eb', fontSize: 12, fontWeight: '700' }, isRTL && styles.rtlText]}>
                             Rider: {dt(o.delivery_guy_name)}
                          </Text>
                        ) : null}
                      </View>

                      {o.inventory_note ? (
                        <Text style={[{ color: '#ef4444', fontWeight: '700', marginTop: 4, fontSize: 12 }, isRTL && styles.rtlText]}>
                          Note: {dt(o.inventory_note)}
                        </Text>
                      ) : null}

                      <Text style={[{ color: '#2563eb', fontSize: 12, fontWeight: '700', marginTop: 6 }, isRTL && styles.rtlText]}>
                        {lang === 'ar' ? 'اضغط لعرض مسار الشحنة بالكامل' : 'Tap to view full order journey'}
                      </Text>
                    </TouchableOpacity>
                  ));
                })()}
              </View>
            )}
          </View>
        )}

        {/* ── ROLE 4: FINANCE WORKSTATION ── */}
        {user.role === 'finance' && (
          <View>
            {activeTab === 'tab1' && (
              <View>
                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>{t('deliveryRoster')}</Text>
                {safeFinanceWallets.length === 0 ? (
                  <Text style={[styles.emptyText, theme.textMuted]}>{t('noDeliveries')}</Text>
                ) : safeFinanceWallets.map((g) => {
                  const driverId = g.delivery_guy_id || g.id;
                  const collectionBal = parseFloat(g.collection_balance || 0);
                  const pocketBal = parseFloat(g.pocket_balance !== undefined ? g.pocket_balance : 50);
                  const toppedUp = parseFloat(g.total_topped_up !== undefined ? g.total_topped_up : 50);
                  const spent = parseFloat(g.total_spent || 0);

                  const driverDeliveredOrders = safeOrders.filter(
                    o => (o.delivery_guy_id === driverId || o.delivery_guy_name === g.delivery_guy_name) && o.status === 'delivered'
                  );

                  return (
                    <View key={driverId} style={[styles.orderCard, theme.cardBg, styles.statCardAccentEmerald]}>
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[styles.pulseOnline, { backgroundColor: g.online_status === 'online' ? '#10b981' : '#6b7280' }]} />
                          <Text style={[styles.clientName, theme.text]}>{dt(g.delivery_guy_name || g.name)}</Text>
                        </View>
                        <Text style={[styles.statusTag, { backgroundColor: g.online_status === 'online' ? '#10b981' : '#6b7280' }]}>
                          {g.online_status === 'online' ? t('youAreOnline') : t('youAreOffline')}
                        </Text>
                      </View>

                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={[styles.walletCard, { backgroundColor: '#059669', flex: 1, minWidth: 140 }]}
                          onPress={() => setExpandedDriverWalletId(prev => prev === driverId ? null : driverId)}
                        >
                          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[styles.walletLabel, isRTL && styles.rtlText]}>{t('collectionWallet')}</Text>
                            <Text style={{ color: '#ffffff', fontSize: 11 }}>{expandedDriverWalletId === driverId ? '▲' : '▾'}</Text>
                          </View>
                          <Text style={[styles.walletValue, isRTL && styles.rtlText]}>${collectionBal.toFixed(2)}</Text>

                          <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: isRTL ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                            <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '800' }}>
                              {collectionBal > 0
                                ? (driverDeliveredOrders.length > 0
                                  ? (lang === 'ar' ? `▾ ${driverDeliveredOrders.length} شحنات معلقة (انقر للعرض)` : `▾ ${driverDeliveredOrders.length} Pending (Tap to view)`)
                                  : (lang === 'ar' ? 'نقدية بحوزة المندوب' : 'Cash Held'))
                                : (lang === 'ar' ? 'مسواة بالكامل' : 'Fully Settled')}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={[
                              styles.miniActionBtn,
                              { backgroundColor: collectionBal > 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)', opacity: collectionBal > 0 ? 1 : 0.65 }
                            ]}
                            disabled={collectionBal <= 0 || actionLoadingId === `pullout_${driverId}`}
                            onPress={() => handleFinancePullout(g)}
                          >
                            {actionLoadingId === `pullout_${driverId}` ? (
                              <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                              <Text style={styles.miniActionText}>
                                {collectionBal > 0 ? (lang === 'ar' ? 'تسوية الكل دفعة واحدة' : 'Clear All Orders') : (lang === 'ar' ? 'مسواة بالكامل' : 'Cash Fully Settled')}
                              </Text>
                            )}
                          </TouchableOpacity>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={[styles.walletCard, { backgroundColor: pocketBal < 0 ? '#dc2626' : '#2563eb', flex: 1, minWidth: 140 }]}
                          onPress={() => (user.role === 'finance' || user.role === 'manager') && openPocketLedgerModal(g)}
                        >
                          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[styles.walletLabel, isRTL && styles.rtlText]}>{t('pocketWallet')}</Text>
                            {(user.role === 'finance' || user.role === 'manager') ? (
                              <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '800' }}>{lang === 'ar' ? 'السجل' : 'Ledger'}</Text>
                            ) : null}
                          </View>
                          <Text style={[styles.walletValue, isRTL && styles.rtlText]}>${pocketBal.toFixed(2)}</Text>

                          <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: isRTL ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
                            <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '800' }}>
                              {pocketBal > 0
                                ? (lang === 'ar' ? 'عهدة متاحة' : 'Available')
                                : (pocketBal < 0
                                  ? (lang === 'ar' ? 'عجز بالعهدة' : 'Deficit')
                                  : (lang === 'ar' ? 'رصيد صفر' : 'Zero'))}
                            </Text>
                          </View>

                          <Text style={[{ color: '#ffffff', fontSize: 9, opacity: 0.95, fontWeight: '600', marginBottom: 6 }, isRTL && styles.rtlText]}>
                            {lang === 'ar' ? `المشحون: $${toppedUp.toFixed(2)} | المصروف: $${spent.toFixed(2)}` : `Added: $${toppedUp.toFixed(2)} | Spent: $${spent.toFixed(2)}`}
                          </Text>

                          <TouchableOpacity
                            style={[styles.miniActionBtn, { backgroundColor: 'rgba(255,255,255,0.3)' }]}
                            onPress={() => {
                              setTargetDriver(g);
                              setTopupAmount('50');
                              setTopupModal(true);
                            }}
                          >
                            <Text style={styles.miniActionText}>{t('topUpPocket')}</Text>
                          </TouchableOpacity>
                        </TouchableOpacity>
                      </View>

                      {expandedDriverWalletId === driverId && driverDeliveredOrders.length > 0 ? (
                        <View style={{ marginTop: 12, backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#cbd5e1' }}>
                          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <Text style={[theme.text, { fontSize: 12, fontWeight: '800' }, isRTL && styles.rtlText]}>
                              {lang === 'ar' ? 'شحنات بانتظار تسوية النقدية:' : 'Delivered Orders Pending Cash Settlement:'}
                            </Text>
                            <TouchableOpacity onPress={() => setExpandedDriverWalletId(null)}>
                              <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700' }}>✕ {lang === 'ar' ? 'إغلاق' : 'Close'}</Text>
                            </TouchableOpacity>
                          </View>
                          {driverDeliveredOrders.map((ord) => (
                            <TouchableOpacity
                              key={ord.id}
                              activeOpacity={0.85}
                              style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', padding: 10, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#e2e8f0', flexWrap: 'wrap', gap: 6 }}
                              onPress={() => openOrderAuditModal(ord)}
                            >
                              <View style={{ flex: 1, minWidth: 140 }}>
                                <Text style={[theme.text, { fontSize: 13, fontWeight: '800' }]}>#{ord.tracking_number}</Text>
                                <Text style={[theme.textMuted, { fontSize: 11, marginTop: 2 }]} numberOfLines={1}>{dt(ord.client_address)}</Text>
                              </View>
                              <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end' }}>
                                <Text style={{ color: '#059669', fontSize: 14, fontWeight: '900' }}>${parseFloat(ord.order_amount || 0).toFixed(2)}</Text>
                                <TouchableOpacity
                                  style={[styles.miniActionBtn, { backgroundColor: '#059669', paddingHorizontal: 10, paddingVertical: 4, marginTop: 4, opacity: actionLoadingId === `clearOrder_${ord.id}` ? 0.7 : 1 }]}
                                  disabled={actionLoadingId === `clearOrder_${ord.id}`}
                                  onPress={() => handleFinanceClearOrder(ord.id, ord.tracking_number, ord.order_amount)}
                                >
                                  {actionLoadingId === `clearOrder_${ord.id}` ? (
                                    <ActivityIndicator size="small" color="#ffffff" />
                                  ) : (
                                    <Text style={[styles.miniActionText, { fontSize: 11 }]}>{lang === 'ar' ? 'تسوية النقدية' : 'Clear Cash'}</Text>
                                  )}
                                </TouchableOpacity>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            {/* TAB 2: Audit History */}
            {activeTab === 'tab2' && (
              <View>
                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>{t('tabAuditHistory')}</Text>
                {safeOrders.length === 0 ? (
                  <Text style={[styles.emptyText, theme.textMuted]}>{t('noHistory')}</Text>
                ) : (
                  safeOrders.map((o) => {
                    const isCleared = o.status === 'cash_cleared';
                    return (
                      <TouchableOpacity
                        key={o.id}
                        activeOpacity={0.85}
                        style={[styles.orderCard, theme.cardBg, isCleared ? styles.statCardAccentEmerald : styles.statCardAccentBlue]}
                        onPress={() => openOrderAuditModal(o)}
                      >
                        <View style={[styles.orderHeader, { flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6 }]}>
                          <Text style={[styles.trackingNum, theme.text]}>#{o.tracking_number}</Text>
                          <Text style={[styles.statusTag, { backgroundColor: getStatusColor(o.status) }]}>
                            {isCleared ? (lang === 'ar' ? 'تم تحصيلها وتوريدها' : 'Cash Cleared & Settled') : tStatus(o.status)}
                          </Text>
                        </View>
                        <Text style={[styles.orderDetail, theme.text, isRTL && styles.rtlText, { fontSize: 13, fontWeight: '700', marginTop: 4 }]}>
                          {dt(o.client_address)}
                        </Text>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                          <Text style={[{ color: '#10b981', fontSize: 14, fontWeight: '900' }, isRTL && styles.rtlText]}>
                            ${parseFloat(o.order_amount || 0).toFixed(2)}
                          </Text>
                        </View>
                        <Text style={[{ color: '#2563eb', fontSize: 12, fontWeight: '700', marginTop: 6 }, isRTL && styles.rtlText]}>
                          {lang === 'ar' ? 'اضغط لعرض مسار الشحنة بالكامل' : 'Tap to view full order journey'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            )}
          </View>
        )}

        {/* ── ROLE 5: EXECUTIVE MANAGER (Master Control Center, Read-Only Observer) ── */}
        {user.role === 'manager' && (
          <View>

            {/* TAB 1: Master Executive Overview */}
            {activeTab === 'tab1' && (
              <View>
                <View style={{ marginBottom: 16, backgroundColor: isDarkMode ? '#1e293b' : '#ffffff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#cbd5e1' }}>
                  <Text style={[styles.sectionTitle, theme.text, { fontSize: 18, marginBottom: 4 }, isRTL && styles.rtlText]}>
                    {t('execHeaderTitle')}
                  </Text>
                  <Text style={[theme.textMuted, { fontSize: 12, marginBottom: 16 }, isRTL && styles.rtlText]}>
                    {t('execHeaderSubtitle')}
                  </Text>

                  {/* Company Grand Metrics Grid */}
                  <View style={{ gap: 10 }}>
                    {/* Row 1 */}
                    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10 }}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setActiveTab('tab3')}
                        style={[styles.statCardMini, { backgroundColor: '#2563eb', flex: 1, padding: 14, borderRadius: 14 }]}
                      >
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800' }}> {t('execFleetCardLabel')}</Text>
                          <Ionicons name="people-outline" size={18} color="rgba(255,255,255,0.8)" />
                        </View>
                        <Text style={[styles.statCardMiniVal, { fontSize: 24, marginTop: 4 }]}>{safeDeliveryGuys.length}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 }}>
                          {safeDeliveryGuys.filter(g => g.online_status === 'online').length} {t('execOnlineDrivers')}
                        </Text>
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, marginTop: 4 }}>{lang === 'ar' ? '← اضغط للتفاصيل' : 'Tap to drill down →'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setActiveTab('tab2')}
                        style={[styles.statCardMini, { backgroundColor: '#7c3aed', flex: 1, padding: 14, borderRadius: 14 }]}
                      >
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800' }}>{t('execOrdersCardLabel')}</Text>
                          <Ionicons name="cube-outline" size={18} color="rgba(255,255,255,0.8)" />
                        </View>
                        <Text style={[styles.statCardMiniVal, { fontSize: 24, marginTop: 4 }]}>{safeOrders.length}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 }}>
                          {historyOrders.filter(o => o.status === 'delivered' || o.status === 'cash_cleared').length} {t('execCompletedOrders')}
                        </Text>
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, marginTop: 4 }}>{lang === 'ar' ? '← اضغط للتفاصيل' : 'Tap to drill down →'}</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Row 2 */}
                    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10 }}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setActiveTab('tab3')}
                        style={[styles.statCardMini, { backgroundColor: '#059669', flex: 1, padding: 14, borderRadius: 14 }]}
                      >
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800' }}>{t('execCashCardLabel')}</Text>
                          <Ionicons name="wallet-outline" size={18} color="rgba(255,255,255,0.8)" />
                        </View>
                        <Text style={[styles.statCardMiniVal, { fontSize: 22, marginTop: 4 }]}>${grandCollectionCash.toFixed(2)}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 }}>{t('execCashLiability')}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, marginTop: 4 }}>{lang === 'ar' ? '← اضغط للتفاصيل' : 'Tap to drill down →'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setActiveTab('tab4')}
                        style={[styles.statCardMini, { backgroundColor: '#d97706', flex: 1, padding: 14, borderRadius: 14 }]}
                      >
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800' }}>{t('execExpensesCardLabel')}</Text>
                          <Ionicons name="receipt-outline" size={18} color="rgba(255,255,255,0.8)" />
                        </View>
                        <Text style={[styles.statCardMiniVal, { fontSize: 22, marginTop: 4 }]}>${grandSpentExpenses.toFixed(2)}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 2 }}>{t('execExpensesSpent')}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, marginTop: 4 }}>{lang === 'ar' ? '← اضغط للتفاصيل' : 'Tap to drill down →'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Department Quick Summaries */}
                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>{t('execDepartmentOverviews')}</Text>

                {/* Supervisor Dept Card — navigates to Tab 2 (Ops) */}
                <TouchableOpacity style={[styles.orderCard, theme.cardBg, styles.statCardAccentBlue]} onPress={() => setActiveTab('tab2')} activeOpacity={0.85}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={[styles.trackingNum, theme.text, isRTL && styles.rtlText]}>{t('execSupervisorDeptTitle')}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#2563eb" />
                  </View>
                  <Text style={[theme.textMuted, { fontSize: 12, marginTop: 2 }, isRTL && styles.rtlText]}>
                    {t('execActiveOrders')}: <Text style={{ color: '#2563eb', fontWeight: '800' }}>{activeOrders.length}</Text>
                    {'  |  '}{t('execInTransit')}: <Text style={{ color: '#f59e0b', fontWeight: '800' }}>{safeOrders.filter(o => o.status === 'in_transit').length}</Text>
                    {'  |  '}{lang === 'ar' ? 'مكتملة' : 'Done'}: <Text style={{ color: '#10b981', fontWeight: '800' }}>{safeOrders.filter(o => o.status === 'delivered' || o.status === 'cash_cleared').length}</Text>
                  </Text>
                  <Text style={[{ color: '#2563eb', fontSize: 11, fontWeight: '800', marginTop: 8 }, isRTL && styles.rtlText]}>{t('execTapOpsBoard')}</Text>
                </TouchableOpacity>

                {/* Warehouse Dept Card — navigates to Tab 2 (Ops Board shows all including warehouse statuses) */}
                <TouchableOpacity style={[styles.orderCard, theme.cardBg, styles.statCardAccentAmber]} onPress={() => setActiveTab('tab2')} activeOpacity={0.85}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={[styles.trackingNum, theme.text, isRTL && styles.rtlText]}>{t('execWarehouseDeptTitle')}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#f59e0b" />
                  </View>
                  <Text style={[theme.textMuted, { fontSize: 12, marginTop: 2 }, isRTL && styles.rtlText]}>
                    {t('execPendingHandoff')}: <Text style={{ color: '#f59e0b', fontWeight: '800' }}>{inventoryQueue.length}</Text>
                    {'  |  '}{t('execReportedIssues')}: <Text style={{ color: '#ef4444', fontWeight: '800' }}>{inventoryIssues.length}</Text>
                  </Text>
                  <Text style={[{ color: '#2563eb', fontSize: 11, fontWeight: '800', marginTop: 8 }, isRTL && styles.rtlText]}>{t('execTapWarehouseQueue')}</Text>
                </TouchableOpacity>

                {/* Finance Dept Card — navigates to Tab 3 (Fleet/Wallets) */}
                <TouchableOpacity style={[styles.orderCard, theme.cardBg, styles.statCardAccentEmerald]} onPress={() => setActiveTab('tab3')} activeOpacity={0.85}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={[styles.trackingNum, theme.text, isRTL && styles.rtlText]}>{t('execFinanceDeptTitle')}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#059669" />
                  </View>
                  <Text style={[theme.textMuted, { fontSize: 12, marginTop: 2 }, isRTL && styles.rtlText]}>
                    {t('execDriversMonitored')}: <Text style={{ color: '#059669', fontWeight: '800' }}>{safeFinanceWallets.length}</Text>
                    {'  |  '}{t('execCashSettled')}: <Text style={{ color: '#059669', fontWeight: '800' }}>${grandCollectionCash.toFixed(2)}</Text>
                    {'  |  '}{lang === 'ar' ? 'مصاريف' : 'Expenses'}: <Text style={{ color: '#ef4444', fontWeight: '800' }}>${grandSpentExpenses.toFixed(2)}</Text>
                  </Text>
                  <Text style={[{ color: '#2563eb', fontSize: 11, fontWeight: '800', marginTop: 8 }, isRTL && styles.rtlText]}>{t('execTapFleetWallets')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* TAB 2: Operations Board (Read-Only) */}
            {activeTab === 'tab2' && (
              <View>
                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>{t('execAllOpsTitle')}</Text>

                {/* Exec Ops Board Filter Strip */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12, paddingHorizontal: 2 }}>
                  {[
                    { id: 'all', label: lang === 'ar' ? 'الكل' : 'All', count: safeOrders.length, color: '#64748b' },
                    { id: 'active', label: lang === 'ar' ? 'نشط' : 'Active', count: activeOrders.length, color: '#2563eb' },
                    { id: 'transit', label: lang === 'ar' ? 'بالطريق' : 'Transit', count: safeOrders.filter(o => o.status === 'in_transit').length, color: '#d97706' },
                    { id: 'warehouse', label: lang === 'ar' ? 'بالمخزن' : 'Warehouse', count: inventoryQueue.length, color: '#7c3aed' },
                    { id: 'done', label: lang === 'ar' ? 'مكتمل' : 'Done', count: safeOrders.filter(o => o.status === 'delivered' || o.status === 'cash_cleared').length, color: '#059669' },
                    { id: 'failed', label: lang === 'ar' ? 'فشل' : 'Failed', count: safeOrders.filter(o => o.status === 'delivery_failed').length, color: '#ef4444' },
                  ].map(f => (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => setExecOpsFilter(f.id)}
                      style={{
                        backgroundColor: execOpsFilter === f.id ? f.color : (isDarkMode ? '#1e293b' : '#f1f5f9'),
                        borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        borderWidth: 1.5,
                        borderColor: execOpsFilter === f.id ? f.color : (isDarkMode ? '#334155' : '#cbd5e1')
                      }}
                    >
                      <Text style={{ color: execOpsFilter === f.id ? '#ffffff' : (isDarkMode ? '#94a3b8' : '#475569'), fontSize: 12, fontWeight: '800' }}>{f.label}</Text>
                      <View style={{ backgroundColor: execOpsFilter === f.id ? 'rgba(255,255,255,0.25)' : f.color, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                        <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '900' }}>{f.count}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {execOpsFilteredOrders.length === 0 ? (
                  <Text style={[styles.emptyText, theme.textMuted]}>{t('noDeliveries')}</Text>
                ) : (
                  execOpsFilteredOrders.map((o) => (
                    <TouchableOpacity
                      key={o.id}
                      activeOpacity={0.85}
                      style={[styles.orderCard, theme.cardBg, styles.statCardAccentBlue]}
                      onPress={() => openOrderAuditModal(o)}
                    >
                      <View style={[styles.orderHeader, { flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 6 }]}>
                        <Text style={[styles.trackingNum, theme.text]}>#{o.tracking_number}</Text>
                        <Text style={[styles.statusTag, { backgroundColor: getStatusColor(o.status) }]}>{tStatus(o.status)}</Text>
                      </View>
                      <Text style={[styles.orderDetail, theme.text, isRTL && styles.rtlText, { fontSize: 14, fontWeight: '700', marginTop: 4 }]}>
                        {dt(o.client_address)}
                      </Text>
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                        <Text style={[{ color: '#059669', fontSize: 15, fontWeight: '900' }, isRTL && styles.rtlText]}>
                          ${parseFloat(o.order_amount || 0).toFixed(2)}
                        </Text>
                        {o.delivery_guy_name ? (
                          <Text style={[{ color: '#2563eb', fontSize: 12, fontWeight: '700' }, isRTL && styles.rtlText]}>
                             {dt(o.delivery_guy_name)}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={[{ color: '#2563eb', fontSize: 11, fontWeight: '800', marginTop: 6 }, isRTL && styles.rtlText]}>
                        {lang === 'ar' ? 'اضغط لعرض مسار وتاريخ الشحنة بالكامل' : 'Tap to inspect full order journey →'}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {/* TAB 3: Fleet Roster & Wallets (Read-Only) */}
            {activeTab === 'tab3' && (
              <View>
                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>{t('execFleetRosterTitle')}</Text>
                {safeFinanceWallets.map((g) => {
                  const driverId = g.delivery_guy_id || g.id;
                  const collectionBal = parseFloat(g.collection_balance || 0);
                  const pocketBal = parseFloat(g.pocket_balance !== undefined ? g.pocket_balance : 50);

                  return (
                    <TouchableOpacity
                      key={driverId}
                      activeOpacity={0.85}
                      style={[styles.orderCard, theme.cardBg, styles.statCardAccentEmerald]}
                      onPress={() => openDriverStatsModal(g)}
                    >
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 150 }}>
                          <View style={[styles.pulseOnline, { backgroundColor: g.online_status === 'online' ? '#10b981' : '#6b7280' }]} />
                          <Text style={[styles.clientName, theme.text, { flexShrink: 1 }]} numberOfLines={1}>
                            {dt(g.delivery_guy_name || g.name)} (@{g.username || 'driver'})
                          </Text>
                        </View>
                        <View style={{ backgroundColor: g.online_status === 'online' ? '#10b981' : '#6b7280', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' }}>
                          <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '800' }}>
                            {g.online_status === 'online' ? t('youAreOnline') : t('youAreOffline')}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8, marginTop: 10, width: '100%' }}>
                        <View style={{ backgroundColor: '#059669', flex: 1, padding: 10, borderRadius: 10 }}>
                          <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '700' }}>{t('execCollectionCash')}</Text>
                          <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '900', marginTop: 2 }}>${collectionBal.toFixed(2)}</Text>
                        </View>

                        <View style={{ backgroundColor: pocketBal < 0 ? '#dc2626' : '#2563eb', flex: 1, padding: 10, borderRadius: 10 }}>
                          <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '700' }}>{t('execPocketAllowance')}</Text>
                          <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '900', marginTop: 2 }}>${pocketBal.toFixed(2)}</Text>
                        </View>
                      </View>
                      <Text style={{ color: '#2563eb', fontSize: 11, fontWeight: '800', marginTop: 8, textAlign: isRTL ? 'right' : 'left' }}>
                        {lang === 'ar' ? 'اضغط لعرض كامل بيانات المندوب ←' : 'Tap to inspect full driver profile →'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* TAB 4: Expenses Log Breakdown (Read-Only) */}
            {activeTab === 'tab4' && (
              <View>
                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>{t('execFleetExpensesTitle')}</Text>
                {!expensesBreakdown?.breakdown || expensesBreakdown.breakdown.length === 0 ? (
                  <Text style={[styles.emptyText, theme.textMuted]}>{t('execNoExpensesYet')}</Text>
                ) : (
                  expensesBreakdown.breakdown.map((exp) => (
                    <View key={exp.id} style={[styles.orderCard, theme.cardBg, styles.statCardAccentPurple, { paddingVertical: 12 }]}>
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[theme.text, { fontWeight: '800', fontSize: 14 }]}>{dt(exp.delivery_guy_name)}</Text>
                        <Text style={[{ color: '#ef4444', fontWeight: '900', fontSize: 16 }]}>-${parseFloat(exp.amount).toFixed(2)}</Text>
                      </View>
                      <Text style={[theme.text, { fontWeight: '700', marginTop: 4 }, isRTL && styles.rtlText]}>{dt(exp.reason)}</Text>
                      <Text style={[theme.textMuted, { fontSize: 11, marginTop: 4 }, isRTL && styles.rtlText]}>
                        ⏱️ {new Date(exp.created_at).toLocaleString()}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* TAB 5: Executive Approvals & System Admin */}
            {activeTab === 'tab5' && (
              <View>
                <Text style={[styles.sectionTitle, theme.text, isRTL && styles.rtlText]}>{t('pendingApprovals')}</Text>
                {pendingManagers.length === 0 ? (
                  <Text style={[styles.emptyText, theme.textMuted]}>{t('noPending')}</Text>
                ) : (
                  pendingManagers.map((m) => (
                    <View key={m.id} style={[styles.orderCard, theme.cardBg, styles.statCardAccentPurple]}>
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[styles.clientName, theme.text, isRTL && styles.rtlText]}>{dt(m.name)} (@{m.username})</Text>
                        <Text style={[styles.statusTag, { backgroundColor: '#7c3aed' }]}>
                          {m.role ? m.role.replace('_', ' ').toUpperCase() : 'USER'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#10b981', flex: 1, minWidth: 120 }]}
                          onPress={() => handleApproveManager(m.id)}
                        >
                          <Text style={styles.actionBtnText}>{t('approveAccount')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#ef4444', flex: 1, minWidth: 120 }]}
                          onPress={() => handleRejectManager(m.id)}
                        >
                          <Text style={styles.actionBtnText}>{t('rejectAccount')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

          </View>
        )}

      </ScrollView>

      {/* FOOTER TAB BAR */}
      <View style={[styles.tabBar, theme.cardBg, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {tabs.map((tabItem) => (
          <TouchableOpacity
            key={tabItem.id}
            style={[styles.tabItem, activeTab === tabItem.id && styles.tabItemActive]}
            onPress={() => setActiveTab(tabItem.id)}
          >
            <View style={{ position: 'relative' }}>
              <Ionicons
                name={tabItem.icon}
                size={22}
                color={activeTab === tabItem.id ? '#2563eb' : (isDarkMode ? '#94a3b8' : '#64748b')}
              />
              {tabItem.badge > 0 ? (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{tabItem.badge}</Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[
                styles.tabItemText,
                { color: activeTab === tabItem.id ? '#2563eb' : (isDarkMode ? '#94a3b8' : '#64748b') }
              ]}
            >
              {tabItem.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* EXPENSE MODAL */}
      <Modal visible={expenseModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, theme.cardBg, { maxHeight: '90%' }]}>
            <Text style={[styles.modalTitle, theme.text, isRTL && styles.rtlText]}>{t('logPocketExpenseTitle')}</Text>

            {/* Optional Active Order Selection */}
            <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>
              {lang === 'ar' ? 'ربط بشحنة نشطة (اختياري):' : 'Assigned Active Order (Optional):'}
            </Text>
            <ScrollView style={{ maxHeight: 150, marginBottom: 10 }} showsVerticalScrollIndicator={true}>
              {/* Option 1: None / General Expense */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  borderWidth: !expenseOrderId ? 2 : 1,
                  borderColor: !expenseOrderId ? '#2563eb' : (isDarkMode ? '#334155' : '#cbd5e1'),
                  backgroundColor: !expenseOrderId ? (isDarkMode ? 'rgba(37,99,235,0.2)' : 'rgba(37,99,235,0.08)') : (isDarkMode ? '#1e293b' : '#f8fafc'),
                  marginBottom: 6,
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
                onPress={() => setExpenseOrderId('')}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: !expenseOrderId ? '#2563eb' : theme.text.color }}>
                    {lang === 'ar' ? 'مصروف عام (بنزين / صيانة عامة)' : 'General Expense (Fuel / Allowance)'}
                  </Text>
                  <Text style={[theme.textMuted, { fontSize: 11, marginTop: 2 }]}>
                    {lang === 'ar' ? 'بدون تخصيص لشحنة معينة' : 'Unassigned to any specific order'}
                  </Text>
                </View>
                {!expenseOrderId && (
                  <View style={{ backgroundColor: '#2563eb', borderRadius: 12, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="checkmark" size={13} color="#ffffff" />
                  </View>
                )}
              </TouchableOpacity>

              {(() => {
                // Filter ONLY active orders assigned to driver
                const activeOrders = safeOrders.filter(o =>
                  (o.delivery_guy_id === user.id || user.role !== 'delivery_guy') &&
                  !['delivered', 'cash_cleared', 'delivery_failed', 'returned_to_company'].includes(o.status)
                );

                return activeOrders.map((ord) => {
                  const isSelected = expenseOrderId === ord.id;
                  return (
                    <TouchableOpacity
                      key={ord.id}
                      activeOpacity={0.8}
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        borderWidth: isSelected ? 2 : 1,
                        borderColor: isSelected ? '#2563eb' : (isDarkMode ? '#334155' : '#cbd5e1'),
                        backgroundColor: isSelected ? (isDarkMode ? 'rgba(37,99,235,0.2)' : 'rgba(37,99,235,0.08)') : (isDarkMode ? '#1e293b' : '#f8fafc'),
                        marginBottom: 6,
                        flexDirection: isRTL ? 'row-reverse' : 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onPress={() => setExpenseOrderId(ord.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: isSelected ? '#2563eb' : theme.text.color }}>
                          #{ord.tracking_number} • ${parseFloat(ord.order_amount || 0).toFixed(2)}
                        </Text>
                        <Text style={[theme.textMuted, { fontSize: 11, marginTop: 2 }]} numberOfLines={1}>
                          {ord.client_address}
                        </Text>
                      </View>
                      {isSelected && (
                        <View style={{ backgroundColor: '#2563eb', borderRadius: 12, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="checkmark" size={13} color="#ffffff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                });
              })()}
            </ScrollView>

            <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{t('amountSpentLabel')}</Text>
            <TextInput
              style={[styles.input, theme.inputBg, theme.text, isRTL && styles.rtlText]}
              placeholder={t('amountPlaceholder')}
              placeholderTextColor="#94a3b8"
              keyboardType="numeric"
              value={expenseAmount}
              onChangeText={setExpenseAmount}
            />
            <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{t('mandatoryReasonLabel')}</Text>
            <TextInput
              style={[styles.input, styles.multilineInput, theme.inputBg, theme.text, isRTL && styles.rtlText]}
              placeholder={t('reasonPlaceholder')}
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
              value={expenseReason}
              onChangeText={setExpenseReason}
            />
            <TouchableOpacity style={[styles.primaryButton, { marginTop: 12 }]} onPress={submitExpense} disabled={actionLoadingId === 'expense'}>
              {actionLoadingId === 'expense' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t('submitExpense')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => { setExpenseModal(false); setExpenseOrderId(''); }}>
              <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* DISPATCH NEW ORDER WIZARD MODAL (3-STEP SCREEN FLOW) */}
      <Modal visible={createOrderModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, theme.cardBg, { maxHeight: '90%' }]}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isDarkMode ? '#334155' : '#cbd5e1', alignSelf: 'center', marginBottom: 12 }} />

            {/* Header & Step Counter Bar */}
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={[styles.modalTitle, theme.text, { marginBottom: 0, flex: 1 }, isRTL && styles.rtlText]}>
                {editingOrderId ? (lang === 'ar' ? 'تعديل الشحنة' : 'Edit Order') : t('dispatchOrderTitle')}
              </Text>
              <View style={{ backgroundColor: '#2563eb', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>
                  {lang === 'ar' ? `الخطوة ${createOrderStep} من 3` : `Step ${createOrderStep} of 3`}
                </Text>
              </View>
            </View>

            {/* Visual Step Progress Bar */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: createOrderStep >= 1 ? '#2563eb' : (isDarkMode ? '#334155' : '#cbd5e1') }} />
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: createOrderStep >= 2 ? '#2563eb' : (isDarkMode ? '#334155' : '#cbd5e1') }} />
              <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: createOrderStep >= 3 ? '#2563eb' : (isDarkMode ? '#334155' : '#cbd5e1') }} />
            </View>

            {/* ── STEP 1: Package Number, Address & Amount ── */}
            {createOrderStep === 1 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[theme.text, { fontSize: 13, fontWeight: '800', marginBottom: 12 }, isRTL && styles.rtlText]}>
                  {lang === 'ar' ? 'الخطوة 1: بيانات الشحنة والعنوان والمبلغ' : 'Step 1: Package Code, Address & Amount'}
                </Text>

                {/* Field 1: Order Number / Code */}
                <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>
                  {lang === 'ar' ? 'رقم الشحنة / الكود *' : 'Order Number / Code *'}
                </Text>
                <TextInput
                  style={[styles.input, theme.inputBg, theme.text, isRTL && styles.rtlText]}
                  placeholder={lang === 'ar' ? 'مثال: 104520' : 'e.g. 104520'}
                  placeholderTextColor="#94a3b8"
                  value={orderNumber}
                  onChangeText={setOrderNumber}
                />

                {/* Field 2: Delivery Address */}
                <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{t('clientAddressLabel')} *</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput, theme.inputBg, theme.text, isRTL && styles.rtlText]}
                  placeholder={t('clientAddressPlaceholder')}
                  placeholderTextColor="#94a3b8"
                  multiline
                  numberOfLines={2}
                  value={clientAddress}
                  onChangeText={setClientAddress}
                />

                {/* Field 3: Amount to Collect */}
                <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{t('orderAmountLabel')} *</Text>
                <TextInput
                  style={[styles.input, theme.inputBg, theme.text, isRTL && styles.rtlText]}
                  placeholder={t('orderAmountPlaceholder')}
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={orderAmount}
                  onChangeText={setOrderAmount}
                />

                {/* Next Button -> Step 2 */}
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: '#2563eb', marginTop: 16 }]}
                  onPress={() => {
                    if (!orderNumber.trim()) {
                      Alert.alert(t('alertError'), lang === 'ar' ? 'يرجى أدخال رقم أو كود الشحنة أولاً!' : 'Please enter Order Number / Code first!');
                      return;
                    }
                    if (!clientAddress.trim()) {
                      Alert.alert(t('alertError'), lang === 'ar' ? 'يرجى كتابة عنوان التوصيل!' : 'Please enter delivery address!');
                      return;
                    }
                    if (!orderAmount.trim()) {
                      Alert.alert(t('alertError'), lang === 'ar' ? 'يرجى أدخال مبلغ الشحنة!' : 'Please enter order amount!');
                      return;
                    }
                    setCreateOrderStep(2);
                  }}
                >
                  <Text style={styles.primaryButtonText}>
                    {lang === 'ar' ? 'التالي: طريقة الدفع' : 'Next: Payment Method'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setCreateOrderModal(false);
                    setCreateOrderStep(1);
                    setEditingOrderId(null);
                    setOrderNumber('');
                    setClientAddress('');
                    setOrderAmount('');
                    setAssigneeId('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* ── STEP 2: Payment Method Selection ── */}
            {createOrderStep === 2 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Step 1 Summary Banner */}
                <View style={{ backgroundColor: isDarkMode ? '#1e293b' : '#eff6ff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 14 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563eb' }}>{lang === 'ar' ? 'ملخص الشحنة:' : 'Order Summary:'}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: theme.text.color, marginTop: 2 }}>
                    #{orderNumber} • ${parseFloat(orderAmount || 0).toFixed(2)}
                  </Text>
                  <Text style={[theme.textMuted, { fontSize: 11, marginTop: 2 }]} numberOfLines={1}>
                    {clientAddress}
                  </Text>
                </View>

                <Text style={[theme.text, { fontSize: 13, fontWeight: '800', marginBottom: 10 }, isRTL && styles.rtlText]}>
                  {lang === 'ar' ? 'الخطوة 2: اختر طريقة الدفع للشحنة' : 'Step 2: Select Payment Method'}
                </Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {[
                    { val: 'pay_after_delivery', label_ar: 'كاش (دفع عند التسليم)', label_en: 'Cash on Delivery' },
                    { val: 'instapay', label_ar: 'انستا باي (InstaPay)', label_en: 'InstaPay' },
                    { val: 'vodafone_cash', label_ar: 'فودافون كاش / محفظة', label_en: 'Vodafone Cash / Wallet' },
                    { val: 'installments', label_ar: 'تقسيط / أقساط', label_en: 'Installments' },
                    { val: 'full_upfront', label_ar: 'دفع مقدم كامل', label_en: 'Full Upfront' },
                    { val: 'accounts_payable', label_ar: 'حسابات / آجل', label_en: 'Accounts Payable' }
                  ].map((pt) => {
                    const isSelected = paymentTypeInput === pt.val;
                    return (
                      <TouchableOpacity
                        key={pt.val}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderRadius: 10,
                          borderWidth: isSelected ? 2 : 1,
                          backgroundColor: isSelected ? '#2563eb' : (isDarkMode ? '#1e293b' : '#f8fafc'),
                          borderColor: isSelected ? '#2563eb' : (isDarkMode ? '#334155' : '#cbd5e1')
                        }}
                        onPress={() => setPaymentTypeInput(pt.val)}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '800', color: isSelected ? '#ffffff' : (isDarkMode ? '#94a3b8' : '#334155') }}>
                          {lang === 'ar' ? pt.label_ar : pt.label_en}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Navigation Buttons */}
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, marginTop: 8 }}>
                  <TouchableOpacity
                    style={[styles.cancelButton, { flex: 1, marginTop: 0 }]}
                    onPress={() => setCreateOrderStep(1)}
                  >
                    <Text style={styles.cancelButtonText}>{lang === 'ar' ? 'السابق' : 'Back'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.primaryButton, { flex: 2, backgroundColor: '#2563eb', marginTop: 0 }]}
                    onPress={() => setCreateOrderStep(3)}
                  >
                    <Text style={styles.primaryButtonText}>
                      {lang === 'ar' ? 'التالي: اختيار المندوب' : 'Next: Assign Driver'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {/* ── STEP 3: Delivery Driver Selection & Final Dispatch ── */}
            {createOrderStep === 3 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Full Order Summary Banner */}
                <View style={{ backgroundColor: isDarkMode ? '#1e293b' : '#eff6ff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 14 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563eb' }}>{lang === 'ar' ? 'ملخص بيانات الشحنة والدفع:' : 'Order & Payment Summary:'}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: theme.text.color, marginTop: 2 }}>
                    #{orderNumber} • ${parseFloat(orderAmount || 0).toFixed(2)} • ({paymentTypeInput.toUpperCase()})
                  </Text>
                  <Text style={[theme.textMuted, { fontSize: 11, marginTop: 2 }]} numberOfLines={1}>
                    {clientAddress}
                  </Text>
                </View>

                <Text style={[theme.text, { fontSize: 13, fontWeight: '800', marginBottom: 10 }, isRTL && styles.rtlText]}>
                  {lang === 'ar' ? 'الخطوة 3: حدد مندوب التوصيل للتأكيد' : 'Step 3: Select Delivery Driver'} *
                </Text>

                <View style={{ gap: 8, marginBottom: 16 }}>
                  {safeDeliveryGuys.map((g) => {
                    const isSelected = assigneeId === (g.id || g.delivery_guy_id);
                    return (
                      <TouchableOpacity
                        key={g.id || g.delivery_guy_id}
                        activeOpacity={0.8}
                        style={{
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: isSelected ? 2 : 1,
                          borderColor: isSelected ? '#2563eb' : (isDarkMode ? '#334155' : '#cbd5e1'),
                          backgroundColor: isSelected ? (isDarkMode ? 'rgba(37,99,235,0.2)' : 'rgba(37,99,235,0.08)') : (isDarkMode ? '#1e293b' : '#f8fafc'),
                          flexDirection: isRTL ? 'row-reverse' : 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                        onPress={() => setAssigneeId(g.id || g.delivery_guy_id)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ backgroundColor: g.online_status === 'online' ? '#10b981' : '#6b7280', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                              {g.online_status === 'online' ? 'Online' : 'Offline'}
                            </Text>
                          </View>
                          <View>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: isSelected ? '#2563eb' : theme.text.color }}>
                              {dt(g.name || g.delivery_guy_name)}
                            </Text>
                            <Text style={[theme.textMuted, { fontSize: 11 }]}>
                              @{g.username}
                            </Text>
                          </View>
                        </View>
                        {isSelected && (
                          <View style={{ backgroundColor: '#2563eb', borderRadius: 12, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="checkmark" size={14} color="#ffffff" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Navigation Buttons */}
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, marginTop: 8 }}>
                  <TouchableOpacity
                    style={[styles.cancelButton, { flex: 1, marginTop: 0 }]}
                    onPress={() => setCreateOrderStep(2)}
                  >
                    <Text style={styles.cancelButtonText}>{lang === 'ar' ? 'السابق' : 'Back'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.primaryButton, { flex: 2, backgroundColor: '#059669', marginTop: 0 }]}
                    onPress={handleCreateOrder}
                    disabled={actionLoadingId === 'createOrder'}
                  >
                    {actionLoadingId === 'createOrder' ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {editingOrderId ? (lang === 'ar' ? 'حفظ التعديلات' : 'Save Changes') : (lang === 'ar' ? 'تأكيد وإرسال الشحنة' : 'Confirm & Dispatch')}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

          </View>
        </View>
      </Modal>

      {/* DELIVERY FAILURE MODAL */}
      <Modal visible={failureModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, theme.cardBg]}>
            <Text style={[styles.modalTitle, { color: '#ef4444' }, isRTL && styles.rtlText]}>{t('deliveryFailureTitle')}</Text>
            <View style={{ gap: 6, marginBottom: 12 }}>
              {[
                t('reasonClientUnreachable'),
                t('reasonWrongAddress'),
                t('reasonClientRefused'),
                t('reasonClientCancelled'),
              ].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[styles.presetChip, failureReason === preset && styles.presetChipActive]}
                  onPress={() => setFailureReason(preset)}
                >
                  <Text style={[styles.presetText, failureReason === preset && styles.presetTextActive, isRTL && styles.rtlText]}>
                    {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, theme.inputBg, theme.text, isRTL && styles.rtlText]}
              placeholder="Custom reason note..."
              placeholderTextColor="#94a3b8"
              value={failureReason}
              onChangeText={setFailureReason}
            />
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#ef4444', marginTop: 12 }]} onPress={handleConfirmDeliveryFailure}>
              <Text style={styles.primaryButtonText}>{t('confirmFailureBtn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => { setFailureModal(false); setSelectedOrderId(null); }}>
              <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ORDER STATUS PROGRESSION MODAL */}
      <Modal visible={orderStatusModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, theme.cardBg]}>
            <Text style={[styles.modalTitle, theme.text, isRTL && styles.rtlText]}>
              {lang === 'ar' ? 'تحديث حالة الشحنة' : 'Update Delivery Progress'} #{selectedOrderForStatus?.tracking_number}
            </Text>

            {selectedOrderForStatus && (selectedOrderForStatus.status === 'assigned' || selectedOrderForStatus.status === 'notified_inventory') && (
              <View style={{ marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#7c3aed' }]}
                  onPress={() => {
                    Alert.alert(
                      t('pickupGoToInventory'),
                      t('pickupGoToInventoryMsg'),
                      [
                        { text: lang === 'ar' ? 'حسناً، فهمت' : 'OK, Got It', style: 'default' }
                      ]
                    );
                  }}
                >
                  <Text style={styles.actionBtnText}>{t('pickupFromWarehouse')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {selectedOrderForStatus && selectedOrderForStatus.status === 'handed_to_delivery' && (
              <View style={{ marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#2563eb' }]}
                  onPress={() => {
                    const id = selectedOrderForStatus.id;
                    setOrderStatusModal(false);
                    setSelectedOrderForStatus(null);
                    updateDeliveryStatus(id, 'in_transit');
                  }}
                >
                  <Text style={styles.actionBtnText}> {t('startTransit')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {selectedOrderForStatus && selectedOrderForStatus.status === 'in_transit' && (
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.sectionTitle, theme.text, { fontSize: 14, marginBottom: 8 }, isRTL && styles.rtlText]}>
                  {lang === 'ar' ? 'الخطوة النهائية المتاحة:' : 'Final Resolution Step:'}
                </Text>
                <View style={{ gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#10b981' }]}
                    onPress={() => {
                      const id = selectedOrderForStatus.id;
                      const amt = selectedOrderForStatus.order_amount;
                      setOrderStatusModal(false);
                      setSelectedOrderForStatus(null);
                      updateDeliveryStatus(id, 'delivered', amt);
                    }}
                  >
                    <Text style={styles.actionBtnText}>{t('deliveredCollect')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}
                    onPress={() => {
                      const id = selectedOrderForStatus.id;
                      setOrderStatusModal(false);
                      setSelectedOrderId(id);
                      setSelectedOrderForStatus(null);
                      setFailureModal(true);
                    }}
                  >
                    <Text style={styles.actionBtnText}>{t('deliveryFailed')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <TouchableOpacity style={[styles.cancelButton, { marginTop: 16 }]} onPress={() => { setOrderStatusModal(false); setSelectedOrderForStatus(null); }}>
              <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* DRIVER STATS & BUDGET MODAL */}
      <Modal visible={driverStatsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, theme.cardBg, { maxHeight: '90%' }]}>
            {selectedDriverForStats ? (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
                  <Text style={[styles.modalTitle, theme.text, { marginBottom: 0, flex: 1, marginRight: 8 }, isRTL && styles.rtlText]}>
                    {dt(selectedDriverForStats.name || selectedDriverForStats.delivery_guy_name)}
                  </Text>
                  <View style={{ backgroundColor: selectedDriverForStats.online_status === 'online' ? '#10b981' : '#6b7280', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>
                      {selectedDriverForStats.online_status === 'online' ? t('youAreOnline') : t('youAreOffline')}
                    </Text>
                  </View>
                </View>

                <Text style={[theme.textMuted, { fontSize: 13, marginBottom: 12 }, isRTL && styles.rtlText]}>
                  @{selectedDriverForStats.username || 'driver'}
                </Text>

                <Text style={[styles.sectionTitle, theme.text, { fontSize: 15, marginBottom: 8 }, isRTL && styles.rtlText]}>
                  {lang === 'ar' ? 'إحصائيات الأداء والشحنات' : 'Delivery Performance KPIs'}
                </Text>
                {(() => {
                  const driverId = selectedDriverForStats.id || selectedDriverForStats.delivery_guy_id;
                  const driverOrders = safeOrders.filter(o => o.delivery_guy_id === driverId);
                  const totalAssigned = driverOrders.length;
                  const completedCount = driverOrders.filter(o => o.status === 'delivered' || o.status === 'cash_cleared').length;
                  const inTransitCount = driverOrders.filter(o => o.status === 'in_transit').length;
                  const failedCount = driverOrders.filter(o => o.status === 'delivery_failed').length;

                  const driverWallet = getDriverWallet(driverId || selectedDriverForStats.username);
                  const colBal = driverWallet.collection_balance;
                  const pockBal = driverWallet.pocket_balance;

                  return (
                    <View>
                      {/* KPI Row - Extended */}
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 6, marginBottom: 16, width: '100%' }}>
                        <View style={{ backgroundColor: '#2563eb', flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 9, fontWeight: '800' }}>{lang === 'ar' ? 'الكل' : 'TOTAL'}</Text>
                          <Text style={{ color: '#ffffff', fontSize: 16, marginTop: 2, fontWeight: '900' }}>{totalAssigned}</Text>
                        </View>
                        <View style={{ backgroundColor: '#059669', flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 9, fontWeight: '800' }}>{lang === 'ar' ? 'مكتمل' : 'DONE'}</Text>
                          <Text style={{ color: '#ffffff', fontSize: 16, marginTop: 2, fontWeight: '900' }}>{completedCount}</Text>
                        </View>
                        <View style={{ backgroundColor: '#d97706', flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 9, fontWeight: '800' }}>{lang === 'ar' ? 'بالطريق' : 'TRANSIT'}</Text>
                          <Text style={{ color: '#ffffff', fontSize: 16, marginTop: 2, fontWeight: '900' }}>{inTransitCount}</Text>
                        </View>
                        <View style={{ backgroundColor: '#ef4444', flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 9, fontWeight: '800' }}>{lang === 'ar' ? 'فشل' : 'FAILED'}</Text>
                          <Text style={{ color: '#ffffff', fontSize: 16, marginTop: 2, fontWeight: '900' }}>{failedCount}</Text>
                        </View>
                      </View>

                      {/* Wallet Section */}
                      <Text style={[styles.sectionTitle, theme.text, { fontSize: 14, marginTop: 4, marginBottom: 10 }, isRTL && styles.rtlText]}>
                        {lang === 'ar' ? 'الميزانية والمحافظ' : 'Wallet Budget & Cash'}
                      </Text>
                      <View style={{
                        backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc',
                        padding: 14, borderRadius: 14,
                        borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#cbd5e1',
                        gap: 10, marginBottom: 16
                      }}>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={[theme.textMuted, { fontSize: 13, fontWeight: '600' }, isRTL && styles.rtlText]}>
                            {lang === 'ar' ? 'نقدية التحصيل بحوزته:' : 'Collection Cash Liability:'}
                          </Text>
                          <Text style={{ color: '#059669', fontWeight: '900', fontSize: 15 }}>${colBal.toFixed(2)}</Text>
                        </View>
                        <View style={{ height: 1, backgroundColor: isDarkMode ? '#334155' : '#e2e8f0' }} />
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={[theme.textMuted, { fontSize: 13, fontWeight: '600' }, isRTL && styles.rtlText]}>
                            {lang === 'ar' ? 'رصيد العهدة الحالية:' : 'Pocket Allowance Balance:'}
                          </Text>
                          <Text style={{ color: pockBal < 0 ? '#ef4444' : '#2563eb', fontWeight: '900', fontSize: 15 }}>${pockBal.toFixed(2)}</Text>
                        </View>
                      </View>

                      {/* Driver's Orders Drill-Down List */}
                      <Text style={[styles.sectionTitle, theme.text, { fontSize: 14, marginBottom: 10 }, isRTL && styles.rtlText]}>
                        {lang === 'ar' ? 'شحنات هذا المندوب (اضغط لعرض مسار الشحنة):' : "Driver's Orders — Tap to inspect:"}
                      </Text>
                      {driverOrders.length === 0 ? (
                        <Text style={[styles.emptyText, theme.textMuted]}>{t('noDeliveries')}</Text>
                      ) : (
                        driverOrders.map(o => (
                          <TouchableOpacity
                            key={o.id}
                            activeOpacity={0.85}
                            style={{
                              backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc',
                              borderRadius: 10,
                              padding: 12,
                              marginBottom: 8,
                              borderLeftWidth: 4,
                              borderLeftColor: getStatusColor(o.status),
                              borderWidth: 1,
                              borderColor: isDarkMode ? '#334155' : '#e2e8f0'
                            }}
                            onPress={() => {
                              setDriverStatsModal(false);
                              setSelectedDriverForStats(null);
                              openOrderAuditModal(o);
                            }}
                          >
                            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ color: '#2563eb', fontWeight: '800', fontSize: 13 }}>#{o.tracking_number}</Text>
                              <Text style={[styles.statusTag, { backgroundColor: getStatusColor(o.status), fontSize: 10 }]}>{tStatus(o.status)}</Text>
                            </View>
                            <Text style={[theme.text, { fontSize: 12, fontWeight: '600', marginTop: 4 }, isRTL && styles.rtlText]} numberOfLines={1}>
                              {dt(o.client_address)}
                            </Text>
                            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', marginTop: 4 }}>
                              <Text style={{ color: '#059669', fontSize: 13, fontWeight: '900' }}>${parseFloat(o.order_amount || 0).toFixed(2)}</Text>
                              <Text style={{ color: '#6366f1', fontSize: 10, fontWeight: '700' }}>
                                {lang === 'ar' ? 'اضغط لعرض المسار' : 'Tap to view journey →'}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))
                      )}
                    </View>
                  );
                })()}
              </ScrollView>
            ) : null}

            <TouchableOpacity style={[styles.cancelButton, { marginTop: 18 }]} onPress={() => { setDriverStatsModal(false); setSelectedDriverForStats(null); }}>
              <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SUPERVISOR KPI CARD DETAILS MODAL */}
      <Modal visible={supervisorCardModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, theme.cardBg, { maxHeight: '88%' }]}>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={[styles.modalTitle, theme.text, { flex: 1 }, isRTL && styles.rtlText]}>
                {supervisorCardType === 'active' && (lang === 'ar' ? 'الطلبات النشطة' : 'Active Orders')}
                {supervisorCardType === 'transit' && (lang === 'ar' ? ' قيد التوصيل' : ' In Transit Orders')}
                {supervisorCardType === 'done' && (lang === 'ar' ? 'الطلبات المكتملة' : 'Completed Orders')}
                {supervisorCardType === 'drivers' && (lang === 'ar' ? 'حالة السائقين' : 'Drivers Status')}
              </Text>
              <TouchableOpacity onPress={() => setSupervisorCardModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={22} color={isDarkMode ? '#94a3b8' : '#64748b'} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {supervisorCardType === 'drivers' ? (
                safeDeliveryGuys.length === 0 ? (
                  <Text style={[theme.textMuted, { textAlign: 'center', paddingVertical: 20 }]}>{t('noDeliveries')}</Text>
                ) : (
                  safeDeliveryGuys.map(g => (
                    <View key={g.id} style={{
                      flexDirection: isRTL ? 'row-reverse' : 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc',
                      borderRadius: 12,
                      padding: 14,
                      marginBottom: 10,
                      borderWidth: 1,
                      borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                    }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[theme.text, { fontWeight: '700', fontSize: 14 }, isRTL && styles.rtlText]}>{dt(g.name)}</Text>
                        <Text style={[theme.textMuted, { fontSize: 12 }, isRTL && styles.rtlText]}>@{g.username} {g.phone ? `• ${g.phone}` : ''}</Text>
                      </View>
                      <View style={{
                        backgroundColor: g.online_status === 'online' ? '#10b981' : '#6b7280',
                        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8
                      }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                          {g.online_status === 'online' ? 'Online' : '⚫ Offline'}
                        </Text>
                      </View>
                    </View>
                  ))
                )
              ) : (
                (() => {
                  const filtered = safeOrders.filter(o => {
                    if (supervisorCardType === 'active') return o.status !== 'delivered' && o.status !== 'delivery_failed' && o.status !== 'cash_cleared';
                    if (supervisorCardType === 'transit') return o.status === 'in_transit';
                    if (supervisorCardType === 'done') return o.status === 'delivered' || o.status === 'cash_cleared';
                    return true;
                  });
                  return filtered.length === 0 ? (
                    <Text style={[theme.textMuted, { textAlign: 'center', paddingVertical: 20 }]}>{t('noDeliveries')}</Text>
                  ) : (
                    filtered.map(o => (
                      <View key={o.id} style={{
                        backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc',
                        borderRadius: 12,
                        padding: 14,
                        marginBottom: 10,
                        borderWidth: 1,
                        borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                      }}>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={{ color: '#2563eb', fontWeight: '800', fontSize: 13 }}>#{o.tracking_number}</Text>
                          <Text style={[styles.statusTag, { backgroundColor: getStatusColor(o.status), fontSize: 10 }]}>{tStatus(o.status)}</Text>
                        </View>
                        <Text style={[theme.text, { fontSize: 13, fontWeight: '600', marginBottom: 2 }, isRTL && styles.rtlText]}>{dt(o.client_address)}</Text>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', marginTop: 4 }}>
                          <Text style={{ color: '#059669', fontSize: 13, fontWeight: '900' }}>${parseFloat(o.order_amount || 0).toFixed(2)}</Text>
                          {o.delivery_guy_name ? (
                            <Text style={{ color: '#6366f1', fontSize: 11, fontWeight: '700' }}> {dt(o.delivery_guy_name)}</Text>
                          ) : (
                            <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700' }}>{lang === 'ar' ? 'غير معين' : 'Unassigned'}</Text>
                          )}
                        </View>
                      </View>
                    ))
                  );
                })()
              )}
            </ScrollView>

            <TouchableOpacity style={[styles.cancelButton, { marginTop: 16 }]} onPress={() => setSupervisorCardModal(false)}>
              <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ENHANCED GLOBAL ORDER JOURNEY & AUDIT TRAIL MODAL */}
      <Modal visible={orderAuditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, theme.cardBg, { maxHeight: '90%', padding: 20 }]}>
            {/* Top Drag Handle Indicator */}
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isDarkMode ? '#334155' : '#cbd5e1', alignSelf: 'center', marginBottom: 12 }} />

            {/* Modal Title & Header Bar */}
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={[styles.modalTitle, theme.text, { fontSize: 16, flex: 1, marginBottom: 0 }, isRTL && styles.rtlText]}>
                {lang === 'ar' ? 'مسار وسجل الشحنة' : 'Order Journey & Details'} #{selectedOrderForAudit?.tracking_number}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {selectedOrderForAudit?.status && (
                  <Text style={[styles.statusTag, { backgroundColor: getStatusColor(selectedOrderForAudit.status) }]}>
                    {tStatus(selectedOrderForAudit.status)}
                  </Text>
                )}
                <TouchableOpacity onPress={() => { setOrderAuditModal(false); setSelectedOrderForAudit(null); }} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={22} color={isDarkMode ? '#94a3b8' : '#64748b'} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Single Unified ScrollView to eliminate crowding & nested scrolling */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
              {/* Order Details Header Card */}
              {selectedOrderForAudit ? (
                <View style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#e2e8f0', marginBottom: 14, gap: 8 }}>
                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[theme.text, { fontWeight: '800', fontSize: 14 }, isRTL && styles.rtlText]}>
                      {lang === 'ar' ? 'تفاصيل الشحنة والمبلغ:' : 'Order Summary & Amount:'}
                    </Text>
                    <Text style={[{ color: '#059669', fontWeight: '900', fontSize: 17 }]}>
                      ${parseFloat(selectedOrderForAudit.order_amount || 0).toFixed(2)}
                    </Text>
                  </View>

                  <Text style={[theme.text, { fontSize: 13, fontWeight: '600', lineHeight: 20 }, isRTL && styles.rtlText]}>
                    {dt(selectedOrderForAudit.client_address)}
                  </Text>

                  {selectedOrderForAudit.order_details ? (
                    <Text style={[theme.textMuted, { fontSize: 12, lineHeight: 18 }, isRTL && styles.rtlText]}>
                      {dt(selectedOrderForAudit.order_details)}
                    </Text>
                  ) : null}

                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    {selectedOrderForAudit.supervisor_name ? (
                      <View style={{ backgroundColor: isDarkMode ? '#0f172a' : '#eff6ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#bfdbfe' }}>
                        <Text style={[theme.textMuted, { fontSize: 11, fontWeight: '700' }]}>👔 {lang === 'ar' ? 'المشرف:' : 'Supervisor:'} {dt(selectedOrderForAudit.supervisor_name)}</Text>
                      </View>
                    ) : null}
                    {selectedOrderForAudit.delivery_guy_name ? (
                      <View style={{ backgroundColor: isDarkMode ? '#0f172a' : '#eff6ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#bfdbfe' }}>
                        <Text style={[theme.textMuted, { fontSize: 11, fontWeight: '700' }]}> {lang === 'ar' ? 'المندوب:' : 'Rider:'} {dt(selectedOrderForAudit.delivery_guy_name)}</Text>
                      </View>
                    ) : null}
                    {selectedOrderForAudit.inventory_note ? (
                      <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#ef4444' }}>
                        <Text style={[{ color: '#ef4444', fontSize: 11, fontWeight: '800' }]}>{dt(selectedOrderForAudit.inventory_note)}</Text>
                      </View>
                    ) : null}
                    {selectedOrderForAudit.delivery_failure_reason ? (
                      <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#ef4444' }}>
                        <Text style={[{ color: '#ef4444', fontSize: 11, fontWeight: '800' }]}>{dt(selectedOrderForAudit.delivery_failure_reason)}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {/* Sub-Tabs Navigation Bar */}
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8, marginBottom: 14 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    alignItems: 'center',
                    backgroundColor: orderAuditTab === 'history' ? '#2563eb' : (isDarkMode ? '#1e293b' : '#f1f5f9'),
                    borderWidth: 1,
                    borderColor: orderAuditTab === 'history' ? '#2563eb' : (isDarkMode ? '#334155' : '#cbd5e1')
                  }}
                  onPress={() => setOrderAuditTab('history')}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: orderAuditTab === 'history' ? '#ffffff' : (isDarkMode ? '#94a3b8' : '#475569') }}>
                    {lang === 'ar' ? 'سجل الرحلة والتسلسل' : 'History & Journey Timeline'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    alignItems: 'center',
                    backgroundColor: orderAuditTab === 'media' ? '#7c3aed' : (isDarkMode ? '#1e293b' : '#f1f5f9'),
                    borderWidth: 1,
                    borderColor: orderAuditTab === 'media' ? '#7c3aed' : (isDarkMode ? '#334155' : '#cbd5e1')
                  }}
                  onPress={() => setOrderAuditTab('media')}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: orderAuditTab === 'media' ? '#ffffff' : (isDarkMode ? '#94a3b8' : '#475569') }}>
                    {lang === 'ar'
                      ? `الوسائط والإثباتات (${orderAttachmentsList.length + orderFeedbackList.length})`
                      : `Media & Proofs (${orderAttachmentsList.length + orderFeedbackList.length})`}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* TAB 1: Chronological Journey Timeline */}
              {orderAuditTab === 'history' && (
                <View>
                  {auditTrailLogs.length === 0 ? (
                    <Text style={[styles.emptyText, theme.textMuted]}>{lang === 'ar' ? 'جاري تحميل سجل الرحلة...' : 'Loading journey timeline...'}</Text>
                  ) : (
                    auditTrailLogs.map((log, idx) => (
                      <View key={log.id || idx} style={{ borderLeftWidth: 3, borderLeftColor: getStatusColor(log.new_status || 'created'), paddingLeft: 12, paddingVertical: 10, marginBottom: 10, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: 8 }}>
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: theme.text.color }}>Step {idx + 1}:</Text>
                            <Text style={[styles.statusTag, { backgroundColor: getStatusColor(log.new_status), fontSize: 10 }]}>
                              {tStatus(log.new_status)}
                            </Text>
                          </View>
                          <Text style={[theme.textMuted, { fontSize: 11 }]}>
                            {new Date(log.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <Text style={[theme.text, { fontWeight: '700', fontSize: 12, marginTop: 4 }, isRTL && styles.rtlText]}>
                          {dt(log.changed_by_name || 'System')} ({t(log.changed_by_role) || log.changed_by_role})
                        </Text>
                        {log.comment ? (
                          <Text style={[theme.textMuted, { fontSize: 12, marginTop: 3, lineHeight: 18 }, isRTL && styles.rtlText]}>
                            {dt(log.comment)}
                          </Text>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* TAB 2: Order Media & Attachments */}
              {orderAuditTab === 'media' && (
                <View>
                  {orderAttachmentsList.length === 0 && orderFeedbackList.length === 0 ? (
                    <Text style={[styles.emptyText, theme.textMuted]}>
                      {lang === 'ar' ? 'لا توجد وسائط أو صور مرفقة لهذا الطلب حتى الآن' : 'No photos or audio recordings attached to this order yet.'}
                    </Text>
                  ) : (
                    <View>
                      {/* Photo Attachments List */}
                      {orderAttachmentsList.length > 0 && (
                        <View style={{ marginBottom: 16 }}>
                          <Text style={[styles.sectionTitle, theme.text, { fontSize: 14, marginBottom: 8 }, isRTL && styles.rtlText]}>
                            {lang === 'ar' ? 'الصور وإثباتات التسليم:' : 'Photo Proofs & Images:'}
                          </Text>
                          {orderAttachmentsList.map((att, idx) => {
                            const imgUri = att.storage_url
                              ? (att.storage_url.startsWith('http') || att.storage_url.startsWith('data:')
                                  ? att.storage_url
                                  : `${apiBase.replace(/\/api\/?$/, '')}${att.storage_url.startsWith('/') ? '' : '/'}${att.storage_url}`)
                              : null;
                            const fileName = `photo_order_${selectedOrderForAudit?.tracking_number}_${att.stage || idx}.jpg`;
                            return (
                              <View key={att.id || idx} style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}>
                                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#7c3aed' }}>
                                    {att.stage ? att.stage.toUpperCase().replace('_', ' ') : 'ATTACHMENT'}
                                  </Text>
                                  <Text style={[theme.textMuted, { fontSize: 10 }]}>
                                    {new Date(att.created_at || Date.now()).toLocaleString()}
                                  </Text>
                                </View>
                                {imgUri ? (
                                  <Image source={{ uri: imgUri }} style={{ width: '100%', height: 180, borderRadius: 10, backgroundColor: '#cbd5e1', marginVertical: 6 }} resizeMode="cover" />
                                ) : (
                                  <Text style={[theme.textMuted, { fontSize: 11 }]}>{lang === 'ar' ? 'صورة مرفقة' : 'Attached Photo'}</Text>
                                )}
                                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                                  {att.uploaded_by_name ? (
                                    <Text style={[theme.textMuted, { fontSize: 11 }, isRTL && styles.rtlText]}>
                                      {lang === 'ar' ? 'بواسطة:' : 'By:'} {dt(att.uploaded_by_name)}
                                    </Text>
                                  ) : <View />}
                                  {imgUri && (
                                    <TouchableOpacity
                                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4 }}
                                      onPress={() => handleDownloadMedia(imgUri, fileName)}
                                    >
                                      <Ionicons name="download-outline" size={14} color="#ffffff" />
                                      <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>
                                        {lang === 'ar' ? 'تنزيل الصورة' : 'Download Photo'}
                                      </Text>
                                    </TouchableOpacity>
                                  )}
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* Voice Note Audio Feedback List */}
                      {orderFeedbackList.length > 0 && (
                        <View style={{ marginBottom: 16 }}>
                          <Text style={[styles.sectionTitle, theme.text, { fontSize: 14, marginBottom: 8 }, isRTL && styles.rtlText]}>
                            {lang === 'ar' ? 'الملاحظات والتسجيلات الصوتية:' : 'Voice Note Audio Recordings:'}
                          </Text>
                          {orderFeedbackList.map((fb, idx) => {
                            const audioUrl = fb.audio_storage_url || fb.audio;
                            const audioFileName = `voice_note_order_${selectedOrderForAudit?.tracking_number}_${idx + 1}.m4a`;
                            const isPlayingThis = playingAudioId === (fb.id || idx);

                            return (
                              <View key={fb.id || idx} style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}>
                                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#2563eb' }}>
                                    {lang === 'ar' ? 'ملاحظة صوتية' : 'Voice Note Recording'} ({fb.duration_seconds || 0}s)
                                  </Text>
                                  <Text style={[theme.textMuted, { fontSize: 10 }]}>
                                    {new Date(fb.created_at || Date.now()).toLocaleString()}
                                  </Text>
                                </View>
                                {fb.recorded_by_name ? (
                                  <Text style={[theme.textMuted, { fontSize: 11, marginTop: 4 }, isRTL && styles.rtlText]}>
                                    {lang === 'ar' ? 'بواسطة:' : 'Recorded by:'} {dt(fb.recorded_by_name)}
                                  </Text>
                                ) : null}

                                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 10, gap: 8 }}>
                                  {audioUrl && (
                                    <TouchableOpacity
                                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isPlayingThis ? '#dc2626' : '#10b981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4 }}
                                      onPress={() => handlePlayAudioFeedback({ ...fb, id: fb.id || idx })}
                                    >
                                      <Ionicons name={isPlayingThis ? "pause-circle-outline" : "play-circle-outline"} size={16} color="#ffffff" />
                                      <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>
                                        {isPlayingThis ? (lang === 'ar' ? 'إيقاف' : 'Pause') : (lang === 'ar' ? 'تشغيل' : 'Play Voice Note')}
                                      </Text>
                                    </TouchableOpacity>
                                  )}
                                  {audioUrl && (
                                    <TouchableOpacity
                                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#7c3aed', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4 }}
                                      onPress={() => handleDownloadMedia(audioUrl, audioFileName)}
                                    >
                                      <Ionicons name="download-outline" size={14} color="#ffffff" />
                                      <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>
                                        {lang === 'ar' ? 'تنزيل الصوت' : 'Download Audio'}
                                      </Text>
                                    </TouchableOpacity>
                                  )}
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Modal Bottom Cancel Button */}
            <TouchableOpacity style={[styles.cancelButton, { marginTop: 10 }]} onPress={() => { setOrderAuditModal(false); setSelectedOrderForAudit(null); }}>
              <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* INVENTORY PICKUP ISSUE MODAL */}
      <Modal visible={inventoryIssueModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, theme.cardBg]}>
            <Text style={[styles.modalTitle, { color: '#f59e0b' }, isRTL && styles.rtlText]}>{t('inventoryIssueTitle')}</Text>
            <View style={{ gap: 6, marginBottom: 12 }}>
              {[
                t('reasonItemDamaged'),
                t('reasonItemMissing'),
                t('reasonDriverDeclined'),
              ].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[styles.presetChip, inventoryIssueReason === preset && styles.presetChipActive]}
                  onPress={() => setInventoryIssueReason(preset)}
                >
                  <Text style={[styles.presetText, inventoryIssueReason === preset && styles.presetTextActive, isRTL && styles.rtlText]}>
                    {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, theme.inputBg, theme.text, isRTL && styles.rtlText]}
              placeholder="Custom issue note..."
              placeholderTextColor="#94a3b8"
              value={inventoryIssueReason}
              onChangeText={setInventoryIssueReason}
            />
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#f59e0b', marginTop: 12 }]} onPress={handleConfirmInventoryIssue}>
              <Text style={styles.primaryButtonText}>{t('confirmIssueBtn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => { setInventoryIssueModal(false); setSelectedOrderId(null); }}>
              <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FINANCE TOPUP MODAL */}
      <Modal visible={topupModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, theme.cardBg]}>
            <Text style={[styles.modalTitle, theme.text, isRTL && styles.rtlText]}>
              {t('topupModalTitle')} ({dt(targetDriver?.delivery_guy_name || targetDriver?.name)})
            </Text>
            <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{t('topupAmountLabel')}</Text>
            <TextInput
              style={[styles.input, theme.inputBg, theme.text, isRTL && styles.rtlText]}
              placeholder="50.00"
              placeholderTextColor="#94a3b8"
              keyboardType="numeric"
              value={topupAmount}
              onChangeText={setTopupAmount}
            />
            <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{t('notesLabel')}</Text>
            <TextInput
              style={[styles.input, theme.inputBg, theme.text, isRTL && styles.rtlText]}
              placeholder="Weekly pocket allowance"
              placeholderTextColor="#94a3b8"
              value={topupNotes}
              onChangeText={setTopupNotes}
            />
            <TouchableOpacity style={[styles.primaryButton, { marginTop: 16 }]} onPress={handleFinanceTopup} disabled={actionLoadingId === 'topup'}>
              {actionLoadingId === 'topup' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{t('confirmTopupBtn')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => { setTopupModal(false); setTargetDriver(null); }}>
              <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FINANCE POCKET WALLET LEDGER HISTORY MODAL (Finance / Manager Only) */}
      <Modal visible={pocketLedgerModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, theme.cardBg, { maxHeight: '85%' }]}>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.modalTitle, theme.text, { fontSize: 16, flex: 1 }, isRTL && styles.rtlText]}>
                {lang === 'ar' ? 'سجل وكشف حساب العهدة' : 'Pocket Wallet Ledger History'}
              </Text>
              <TouchableOpacity onPress={() => { setPocketLedgerModal(false); setSelectedDriverLedgerData(null); }}>
                <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '700' }}>✕ {t('cancel')}</Text>
              </TouchableOpacity>
            </View>

            {loadingLedger ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={[theme.textMuted, { marginTop: 10, fontSize: 13 }]}>
                  {lang === 'ar' ? 'جاري تحميل سجل المعاملات...' : 'Loading wallet transaction ledger...'}
                </Text>
              </View>
            ) : selectedDriverLedgerData ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: isDarkMode ? '#334155' : '#cbd5e1', marginBottom: 14 }}>
                  <Text style={[theme.text, { fontSize: 15, fontWeight: '800' }, isRTL && styles.rtlText]}>
                    {dt(selectedDriverLedgerData.driver?.name)} (@{selectedDriverLedgerData.driver?.username})
                  </Text>

                  <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: isDarkMode ? '#334155' : '#e2e8f0', gap: 6, flexWrap: 'wrap' }}>
                    <View>
                      <Text style={[theme.textMuted, { fontSize: 10, fontWeight: '700' }]}>{lang === 'ar' ? 'الرصيد المتاح' : 'Available Balance'}</Text>
                      <Text style={{ color: selectedDriverLedgerData.pocket_wallet?.current_balance < 0 ? '#dc2626' : '#10b981', fontSize: 16, fontWeight: '900' }}>
                        ${selectedDriverLedgerData.pocket_wallet?.current_balance?.toFixed(2)}
                      </Text>
                    </View>
                    <View>
                      <Text style={[theme.textMuted, { fontSize: 10, fontWeight: '700' }]}>{lang === 'ar' ? 'إجمالي المشحون' : 'Total Topped Up'}</Text>
                      <Text style={{ color: '#2563eb', fontSize: 15, fontWeight: '800' }}>
                        ${selectedDriverLedgerData.pocket_wallet?.total_topped_up?.toFixed(2)}
                      </Text>
                    </View>
                    <View>
                      <Text style={[theme.textMuted, { fontSize: 10, fontWeight: '700' }]}>{lang === 'ar' ? 'إجمالي المصروف' : 'Total Spent'}</Text>
                      <Text style={{ color: '#ef4444', fontSize: 15, fontWeight: '800' }}>
                        ${selectedDriverLedgerData.pocket_wallet?.total_spent?.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={[theme.text, { fontSize: 13, fontWeight: '800', marginBottom: 8 }, isRTL && styles.rtlText]}>
                  {lang === 'ar' ? 'سجل المعاملات والعمليات التفصيلي:' : 'Itemized Transaction Ledger:'}
                </Text>

                {(!selectedDriverLedgerData.transactions || selectedDriverLedgerData.transactions.length === 0) && (!selectedDriverLedgerData.expenses || selectedDriverLedgerData.expenses.length === 0) ? (
                  <Text style={[styles.emptyText, theme.textMuted]}>
                    {lang === 'ar' ? 'لا توجد معاملات مسجلة في كشف الحساب بعد' : 'No recorded transactions in ledger yet'}
                  </Text>
                ) : (
                  (selectedDriverLedgerData.transactions && selectedDriverLedgerData.transactions.length > 0
                    ? selectedDriverLedgerData.transactions
                    : selectedDriverLedgerData.expenses
                  ).map((item, idx) => {
                    const isTopup = item.transaction_type === 'finance_topup' || item.type === 'topup' || (!item.reason && item.amount > 0);
                    const amt = parseFloat(item.amount || 0);
                    const ledgerColor = isTopup ? '#10b981' : '#ef4444';
                    const ledgerBgColor = isTopup
                      ? (isDarkMode ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.06)')
                      : (isDarkMode ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.06)');
                    return (
                      <View
                        key={item.id || idx}
                        style={{
                          backgroundColor: ledgerBgColor,
                          padding: 12,
                          borderRadius: 10,
                          marginBottom: 8,
                          borderLeftWidth: 4,
                          borderLeftColor: ledgerColor,
                          borderWidth: 1,
                          borderColor: isDarkMode ? '#334155' : '#e2e8f0'
                        }}
                      >
                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ backgroundColor: ledgerColor, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ fontSize: 13, fontWeight: '900', color: '#ffffff' }}>
                                {isTopup ? '+ $' + amt.toFixed(2) : '- $' + amt.toFixed(2)}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: ledgerColor }}>
                              {isTopup ? (lang === 'ar' ? 'ايداع' : 'TOP-UP') : (lang === 'ar' ? 'مصروف' : 'SPENT')}
                            </Text>
                          </View>
                          <Text style={[theme.textMuted, { fontSize: 11 }]}>
                            ⏱️ {new Date(item.created_at || Date.now()).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>

                        {item.reason ? (
                          <Text style={[theme.text, { fontSize: 12, fontWeight: '700', marginTop: 4 }, isRTL && styles.rtlText]}>
                            {lang === 'ar' ? 'السبب:' : 'Reason:'} {dt(item.reason)}
                          </Text>
                        ) : null}

                        {item.notes_or_reason ? (
                          <Text style={[theme.textMuted, { fontSize: 11, marginTop: 2 }, isRTL && styles.rtlText]}>
                            {dt(item.notes_or_reason)}
                          </Text>
                        ) : null}

                        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: isDarkMode ? '#334155' : '#f1f5f9' }}>
                          <Text style={[theme.textMuted, { fontSize: 11 }]}>
                            {lang === 'ar' ? 'بواسطة:' : 'By:'} {dt(item.performed_by_name || (isTopup ? 'Mona Finance' : selectedDriverLedgerData.driver?.name))}
                          </Text>
                          {item.balance_after !== undefined ? (
                            <Text style={{ color: '#2563eb', fontSize: 11, fontWeight: '800' }}>
                              {lang === 'ar' ? 'الرصيد بعدها:' : 'Balance After:'} ${parseFloat(item.balance_after).toFixed(2)}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            ) : null}

            <TouchableOpacity style={[styles.cancelButton, { marginTop: 12 }]} onPress={() => { setPocketLedgerModal(false); setSelectedDriverLedgerData(null); }}>
              <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Location Permission Modal */}
      <LocationPermissionModal
        visible={showLocationModal}
        lang={lang}
        onRequestPermission={() => setShowLocationModal(false)}
        onCancel={() => setShowLocationModal(false)}
      />

      {/* Delivery Outcome Selection Modal (13 Options - 2 Step Screen Flow) */}
      <Modal visible={outcomeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, theme.cardBg, { maxHeight: '90%' }]}>

            {/* Step 1 Screen: Select Outcome Option */}
            {outcomeStep === 1 ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[styles.modalTitle, theme.text, { marginBottom: 0, flex: 1 }, isRTL && styles.rtlText]}>
                    {lang === 'ar' ? '📋 الخطوة 1 من 2: اختر حالة النتيجة' : '📋 Step 1 of 2: Select Outcome'}
                  </Text>
                  <View style={{ backgroundColor: '#2563eb', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>1/2</Text>
                  </View>
                </View>

                <Text style={[theme.textMuted, { fontSize: 12, marginBottom: 14 }, isRTL && styles.rtlText]}>
                  {lang === 'ar'
                    ? 'اختر الحالة المناسبة من الخيارات الـ 13 المعتمدة، ثم اضغط (التالي) لكتابة التفاصيل:'
                    : 'Select one of the 13 official delivery outcome options, then tap (Next) to enter details:'}
                </Text>

                {DELIVERY_OUTCOMES.map((item) => {
                  const isSelected = selectedOutcomeKey === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      activeOpacity={0.8}
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        borderWidth: isSelected ? 2 : 1,
                        borderColor: isSelected ? '#2563eb' : (isDarkMode ? '#334155' : '#cbd5e1'),
                        backgroundColor: isSelected
                          ? (isDarkMode ? 'rgba(37,99,235,0.2)' : 'rgba(37,99,235,0.08)')
                          : (isDarkMode ? '#1e293b' : '#f8fafc'),
                        marginBottom: 8,
                        flexDirection: isRTL ? 'row-reverse' : 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                      onPress={() => setSelectedOutcomeKey(item.key)}
                    >
                      <Text style={{ flex: 1, fontWeight: '800', fontSize: 13, color: isSelected ? '#2563eb' : (isDarkMode ? '#fff' : '#0f172a') }}>
                        {lang === 'ar' ? item.label_ar : item.label_en}
                      </Text>
                      {isSelected && (
                        <View style={{ backgroundColor: '#2563eb', borderRadius: 12, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="checkmark" size={14} color="#ffffff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}

                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, marginTop: 16, marginBottom: 10 }}>
                  <TouchableOpacity style={[styles.cancelButton, { flex: 1 }]} onPress={() => setOutcomeModal(false)}>
                    <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryButton, { flex: 1, backgroundColor: '#2563eb' }]}
                    onPress={() => setOutcomeStep(2)}
                  >
                    <Text style={styles.primaryButtonText}>{lang === 'ar' ? 'التالي ←' : 'Next →'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              /* Step 2 Screen: Enter Amounts, Details & Driver Notes */
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={[styles.modalTitle, theme.text, { marginBottom: 0, fontSize: 15, flex: 1 }, isRTL && styles.rtlText]}>
                    {lang === 'ar' ? '📝 الخطوة 2 من 2: تفاصيل التسليم والملاحظات' : '📝 Step 2 of 2: Details & Notes'}
                  </Text>
                  <View style={{ backgroundColor: '#10b981', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>2/2</Text>
                  </View>
                </View>

                {/* Selected Outcome Badge Pill & Back to Step 1 */}
                <View style={{ backgroundColor: isDarkMode ? '#1e293b' : '#eff6ff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 14, flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563eb' }}>{lang === 'ar' ? 'النتيجة المختارة:' : 'Selected Outcome:'}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: theme.text.color, marginTop: 2 }}>
                      {lang === 'ar' ? getOutcomeByKey(selectedOutcomeKey)?.label_ar : getOutcomeByKey(selectedOutcomeKey)?.label_en}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: '#2563eb', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                    onPress={() => setOutcomeStep(1)}
                  >
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{lang === 'ar' ? 'تغيير النتيجة' : 'Change'}</Text>
                  </TouchableOpacity>
                </View>

                {/* Partial Delivery Amount Breakdown Inputs */}
                {getOutcomeByKey(selectedOutcomeKey)?.delivery_outcome === 'partial' && (
                  <View style={{ marginBottom: 14, padding: 14, backgroundColor: isDarkMode ? '#1e293b' : '#fffbe8', borderRadius: 12, borderWidth: 1, borderColor: '#fde68a' }}>
                    <Text style={{ fontWeight: '900', color: '#d97706', fontSize: 14, marginBottom: 10, textAlign: isRTL ? 'right' : 'left' }}>
                      {lang === 'ar' ? '📦 تفاصيل التسليم الجزئي:' : '📦 Partial Delivery Breakdown:'}
                    </Text>

                    <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{lang === 'ar' ? 'مبلغ السلع المستلمة ($)' : 'Delivered Items Amount ($)'}</Text>
                    <TextInput
                      style={[styles.input, theme.inputBg, theme.text, isRTL && styles.rtlText]}
                      keyboardType="numeric"
                      value={deliveredAmountInput}
                      onChangeText={(val) => {
                        setDeliveredAmountInput(val);
                        const orderAmt = parseFloat(selectedOrderForOutcome?.order_amount || 0);
                        const delAmt = parseFloat(val || 0);
                        if (orderAmt > 0 && delAmt >= 0) {
                          setReturnedAmountInput(Math.max(0, orderAmt - delAmt).toFixed(2));
                        }
                      }}
                      placeholder="e.g. 150.00"
                      placeholderTextColor="#94a3b8"
                    />

                    <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{lang === 'ar' ? 'مبلغ السلع المرتجعة ($)' : 'Returned Items Amount ($)'}</Text>
                    <TextInput
                      style={[styles.input, theme.inputBg, theme.text, isRTL && styles.rtlText]}
                      keyboardType="numeric"
                      value={returnedAmountInput}
                      onChangeText={setReturnedAmountInput}
                      placeholder="e.g. 100.00"
                      placeholderTextColor="#94a3b8"
                    />

                    <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{lang === 'ar' ? 'عدد القطع المرتجعة' : 'Returned Quantity'}</Text>
                    <TextInput
                      style={[styles.input, theme.inputBg, theme.text, isRTL && styles.rtlText]}
                      keyboardType="numeric"
                      value={returnedQuantityInput}
                      onChangeText={setReturnedQuantityInput}
                      placeholder="1"
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                )}

                {/* Driver Voice Note Recording & Additional Details */}
                <Text style={[styles.inputLabel, theme.text, { fontSize: 13, fontWeight: '800' }, isRTL && styles.rtlText]}>
                  {lang === 'ar' ? 'تسجيل ملاحظة صوتية وتفاصيل التسليم:' : 'Voice Recording & Driver Notes:'}
                </Text>

                {/* Interactive Voice Note Recorder */}
                <VoiceNoteRecorder
                  lang={lang}
                  isRTL={isRTL}
                  onAudioRecorded={(base64Audio, duration) => {
                    setRecordedAudioNote(base64Audio);
                    setRecordedAudioDuration(duration);
                  }}
                  onAudioCleared={() => {
                    setRecordedAudioNote(null);
                    setRecordedAudioDuration(0);
                  }}
                />

                <Text style={[styles.inputLabel, theme.text, { fontSize: 12, marginTop: 6 }, isRTL && styles.rtlText]}>
                  {lang === 'ar' ? 'ملاحظات نصية إضافية (اختياري):' : 'Additional Text Notes (Optional):'}
                </Text>
                <TextInput
                  style={[styles.input, theme.inputBg, theme.text, { height: 70, textAlignVertical: 'top' }, isRTL && styles.rtlText]}
                  multiline
                  numberOfLines={3}
                  placeholder={lang === 'ar' ? 'أضف أي ملاحظات نصية إضافية عن التسليم...' : 'Add any optional text notes about delivery...'}
                  placeholderTextColor="#94a3b8"
                  value={returnNotesInput}
                  onChangeText={setReturnNotesInput}
                />

                <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 10, marginTop: 16, marginBottom: 16 }}>
                  <TouchableOpacity style={[styles.cancelButton, { flex: 1 }]} onPress={() => setOutcomeStep(1)}>
                    <Text style={styles.cancelButtonText}>{lang === 'ar' ? '← رجوع' : '← Back'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryButton, { flex: 1, backgroundColor: '#10b981' }]}
                    disabled={actionLoadingId === 'confirmOutcome'}
                    onPress={async () => {
                      if (!selectedOrderForOutcome) return;
                      setActionLoadingId('confirmOutcome');
                      try {
                        const mapped = getOutcomeByKey(selectedOutcomeKey);
                        const payload = {
                          delivery_outcome: mapped.delivery_outcome,
                          collection_outcome: mapped.collection_outcome,
                          delivered_items_amount: parseFloat(deliveredAmountInput || 0),
                          returned_items_amount: parseFloat(returnedAmountInput || 0),
                          returned_quantity: parseInt(returnedQuantityInput || 1, 10),
                          return_notes: returnNotesInput ? returnNotesInput.trim() : null
                        };

                        // 1. Submit voice note recording if recorded
                        if (recordedAudioNote) {
                          try {
                            await fetch(`${apiBase}/orders/${selectedOrderForOutcome.id}/feedback`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`
                              },
                              body: JSON.stringify({
                                audio: recordedAudioNote,
                                duration_seconds: recordedAudioDuration
                              })
                            });
                          } catch (e) {
                            console.error('Error uploading driver voice note:', e);
                          }
                        }

                        // 2. Submit delivery outcome update
                        await updateDeliveryStatus(selectedOrderForOutcome.id, mapped.delivery_outcome === 'full' ? 'delivered' : 'delivered', payload.delivered_items_amount, '', payload);
                        setOutcomeModal(false);
                        setRecordedAudioNote(null);
                        setRecordedAudioDuration(0);
                        showToast(lang === 'ar' ? 'تم تسجيل وتأكيد نتيجة التسليم والملاحظة بنجاح!' : 'Delivery outcome & voice note confirmed & saved!');
                      } catch (err) {
                        Alert.alert(t('alertError'), err.message);
                      } finally {
                        setActionLoadingId(null);
                      }
                    }}
                  >
                    {actionLoadingId === 'confirmOutcome' ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>{lang === 'ar' ? 'تأكيد وحفظ النتيجة' : 'Confirm & Save'}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* RIDER CAMERA & PHOTO ATTACHMENT MODAL */}
      <Modal visible={cameraModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, theme.cardBg, { maxHeight: '90%' }]}>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.modalTitle, theme.text, { marginBottom: 0, flex: 1 }, isRTL && styles.rtlText]}>
                {lang === 'ar' ? '📷 التقاط صورة وإرفاق إثبات' : '📷 Capture Photo & Attach Proof'}
              </Text>
              <TouchableOpacity onPress={() => { setCameraModal(false); setSelectedCameraOrder(null); }}>
                <Ionicons name="close-circle" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {!selectedCameraOrder ? (
              /* STEP A: SELECT ORDER */
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[theme.textMuted, { fontSize: 12, marginBottom: 10 }, isRTL && styles.rtlText]}>
                  {lang === 'ar'
                    ? 'اختر الشحنة قيد التوصيل المراد التقاط وتوثيق صورة لها:'
                    : 'Select the in-transit order you want to capture and attach photo proof for:'}
                </Text>

                {/* Quick Search Filter Input */}
                <TextInput
                  style={[styles.input, theme.inputBg, theme.text, { marginBottom: 12 }, isRTL && styles.rtlText]}
                  placeholder={lang === 'ar' ? '🔍 ابحث برقم الشحنة أو العنوان...' : '🔍 Search by tracking # or address...'}
                  placeholderTextColor="#94a3b8"
                  value={cameraFilterText}
                  onChangeText={setCameraFilterText}
                />

                {(() => {
                  const filteredOrders = safeOrders.filter(o => {
                    if (user.role === 'delivery_guy') {
                      if (o.delivery_guy_id !== user.id) return false;
                      if (o.status !== 'in_transit') return false;
                    } else if (user.role === 'inventory') {
                      // Warehouse staff only inspect & photograph orders waiting to be handed off
                      if (!['assigned', 'notified_inventory'].includes(o.status)) return false;
                    }

                    if (!cameraFilterText.trim()) return true;
                    const q = cameraFilterText.toLowerCase();
                    return (
                      (o.tracking_number && o.tracking_number.toLowerCase().includes(q)) ||
                      (o.client_address && o.client_address.toLowerCase().includes(q))
                    );
                  });

                  if (filteredOrders.length === 0) {
                    return (
                      <Text style={[styles.emptyText, theme.textMuted, { marginVertical: 20 }]}>
                        {lang === 'ar' ? 'لا توجد شحنات قيد التوصيل حالياً' : 'No in-transit orders active right now'}
                      </Text>
                    );
                  }

                  return filteredOrders.map(o => (
                    <TouchableOpacity
                      key={o.id}
                      activeOpacity={0.8}
                      style={{
                        backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc',
                        padding: 14,
                        borderRadius: 12,
                        marginBottom: 10,
                        borderWidth: 1.5,
                        borderColor: isDarkMode ? '#334155' : '#cbd5e1'
                      }}
                      onPress={() => setSelectedCameraOrder(o)}
                    >
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ color: '#2563eb', fontWeight: '900', fontSize: 15 }}>#{o.tracking_number}</Text>
                        <Text style={[styles.statusTag, { backgroundColor: getStatusColor(o.status), fontSize: 10 }]}>{tStatus(o.status)}</Text>
                      </View>
                      <Text style={[theme.text, { fontWeight: '700', fontSize: 13 }, isRTL && styles.rtlText]}>
                        📍 {dt(o.client_address)}
                      </Text>
                      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: isDarkMode ? '#334155' : '#e2e8f0' }}>
                        <Text style={{ color: '#059669', fontWeight: '900', fontSize: 14 }}>
                          💵 ${parseFloat(o.order_amount || 0).toFixed(2)}
                        </Text>
                        <Text style={{ color: '#7c3aed', fontWeight: '800', fontSize: 12 }}>
                          {lang === 'ar' ? 'اختر وتصوير 📸' : 'Select Order 📸'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ));
                })()}

                <TouchableOpacity style={[styles.cancelButton, { marginTop: 12 }]} onPress={() => setCameraModal(false)}>
                  <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              /* STEP B: PHOTO CAPTURE & STAGE SELECTION FOR SELECTED ORDER */
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Selected Order Summary Card */}
                <View style={{ backgroundColor: isDarkMode ? '#1e293b' : '#eff6ff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 14, flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563eb' }}>{lang === 'ar' ? 'الشحنة المختارة:' : 'Selected Order:'}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: theme.text.color, marginTop: 2 }}>
                      #{selectedCameraOrder.tracking_number} • ${parseFloat(selectedCameraOrder.order_amount || 0).toFixed(2)}
                    </Text>
                    <Text style={[theme.textMuted, { fontSize: 11, marginTop: 2 }]} numberOfLines={1}>
                      📍 {dt(selectedCameraOrder.client_address)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: '#2563eb', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}
                    onPress={() => setSelectedCameraOrder(null)}
                  >
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{lang === 'ar' ? 'تغيير الشحنة' : 'Change'}</Text>
                  </TouchableOpacity>
                </View>

                {/* Photo Stage Purpose Selection */}
                <Text style={[styles.inputLabel, theme.text, { fontSize: 13, fontWeight: '800' }, isRTL && styles.rtlText]}>
                  🎯 {lang === 'ar' ? 'الغرض من الصورة الإثباتية:' : 'Select Photo Attachment Stage:'}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {[
                    { id: 'payment_confirmation', label_ar: '💳 إيصال تحصيل الدفعة', label_en: 'Payment Receipt' },
                    { id: 'delivery_completion', label_ar: '📦 إثبات التسليم', label_en: 'Delivery Proof' },
                    { id: 'return_verification', label_ar: '↩️ صورة المرتجع', label_en: 'Returned Item' },
                    { id: 'inventory_handoff', label_ar: '🏬 حالة الاستلام', label_en: 'Warehouse Handoff' }
                  ].map((stg) => (
                    <TouchableOpacity
                      key={stg.id}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderRadius: 10,
                        borderWidth: cameraStage === stg.id ? 2 : 1,
                        backgroundColor: cameraStage === stg.id ? '#7c3aed' : (isDarkMode ? '#1e293b' : '#f1f5f9'),
                        borderColor: cameraStage === stg.id ? '#7c3aed' : (isDarkMode ? '#334155' : '#cbd5e1')
                      }}
                      onPress={() => setCameraStage(stg.id)}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: cameraStage === stg.id ? '#ffffff' : (isDarkMode ? '#94a3b8' : '#475569') }}>
                        {lang === 'ar' ? stg.label_ar : stg.label_en}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Native Embedded Photo Capture Component */}
                <PhotoCapture
                  orderId={selectedCameraOrder.id}
                  stage={cameraStage}
                  token={token}
                  apiBase={apiBase}
                  label={lang === 'ar' ? '📷 التقاط صورة أو اختيار ملف' : '📷 Take Photo / Pick Image'}
                  onPhotoCaptured={(storageUrl) => {
                    showToast(
                      lang === 'ar'
                        ? `✅ تم رفع وإرفاق الصورة بنجاح للشحنة #${selectedCameraOrder.tracking_number}`
                        : `✅ Photo attached to Order #${selectedCameraOrder.tracking_number} successfully!`
                    );
                    setCameraModal(false);
                    setSelectedCameraOrder(null);
                    fetchData();
                  }}
                />

                <TouchableOpacity style={[styles.cancelButton, { marginTop: 14 }]} onPress={() => { setCameraModal(false); setSelectedCameraOrder(null); }}>
                  <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Order Payment Recording Modal */}
      <Modal visible={paymentModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, theme.cardBg]}>
            <Text style={[styles.modalTitle, theme.text]}>{lang === 'ar' ? '💳 تسجيل تحصيل دفع الشحنة' : '💳 Record Order Payment'}</Text>

            <Text style={[styles.inputLabel, theme.text, isRTL && styles.rtlText]}>{lang === 'ar' ? 'طريقة الدفع المحصلة:' : 'Payment Collection Method:'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
              {[
                { id: 'cash', label_ar: '💵 كاش (نقد)', label_en: '💵 Cash' },
                { id: 'instapay', label_ar: '⚡ انستا باي (InstaPay)', label_en: '⚡ InstaPay' },
                { id: 'vodafone_cash', label_ar: '📱 فودافون كاش / محفظة', label_en: '📱 Vodafone Cash' },
                { id: 'e_wallet', label_ar: '💳 محفظة إلكترونية', label_en: '💳 E-Wallet' },
                { id: 'installments', label_ar: '📅 قسط (Installment)', label_en: '📅 Installment' },
                { id: 'other', label_ar: '🏦 تحويل / آخر', label_en: '🏦 Other / Transfer' }
              ].map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    borderWidth: paymentMethodInput === item.id ? 2 : 1,
                    backgroundColor: paymentMethodInput === item.id ? '#2563eb' : (isDarkMode ? '#1e293b' : '#f8fafc'),
                    borderColor: paymentMethodInput === item.id ? '#2563eb' : (isDarkMode ? '#334155' : '#cbd5e1')
                  }}
                  onPress={() => setPaymentMethodInput(item.id)}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: paymentMethodInput === item.id ? '#ffffff' : (isDarkMode ? '#94a3b8' : '#334155') }}>
                    {lang === 'ar' ? item.label_ar : item.label_en}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, theme.text]}>{lang === 'ar' ? 'المبلغ المحصل ($)' : 'Payment Amount ($)'}</Text>
            <TextInput style={[styles.input, theme.inputBg, theme.text]} keyboardType="numeric" value={paymentAmountInput} onChangeText={setPaymentAmountInput} placeholder="e.g. 150.00" />

            {paymentMethodInput !== 'cash' && selectedOrderForPayment && (
              <View style={{ marginTop: 10 }}>
                <PhotoCapture
                  stage="payment_confirmation"
                  required={true}
                  lang={lang}
                  apiBase={apiBase}
                  token={token}
                  orderId={selectedOrderForPayment.id}
                  onUploadSuccess={(att) => setPaymentProofAttachmentId(att.id)}
                />
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.cancelButton, { flex: 1 }]} onPress={() => setPaymentModal(false)}>
                <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, { flex: 1, backgroundColor: '#2563eb' }]}
                onPress={async () => {
                  if (!paymentAmountInput || !selectedOrderForPayment) {
                    Alert.alert(t('alertError'), 'Payment amount is required');
                    return;
                  }
                  const res = await fetch(`${apiBase}/orders/${selectedOrderForPayment.id}/payments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                      amount: parseFloat(paymentAmountInput),
                      payment_method: paymentMethodInput,
                      proof_attachment_id: paymentProofAttachmentId
                    })
                  });
                  if (res.ok) {
                    showToast(lang === 'ar' ? 'تم تسجيل الدفع بنجاح' : 'Payment recorded successfully');
                    setPaymentModal(false);
                    fetchData();
                  } else {
                    const data = await res.json();
                    Alert.alert(t('alertError'), data.error || 'Payment recording failed');
                  }
                }}
              >
                <Text style={styles.primaryButtonText}>{lang === 'ar' ? 'تأكيد وحفظ الدفع' : 'Submit Payment'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ==========================================
// 3. STYLESHEETS & THEMING
// ==========================================
const lightTheme = {
  bg: { backgroundColor: '#f8fafc' },
  cardBg: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2
  },
  inputBg: { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' },
  text: { color: '#0f172a' },
  textMuted: { color: '#64748b' }
};

const darkTheme = {
  bg: { backgroundColor: '#0b0f19' },
  cardBg: {
    backgroundColor: '#111827',
    borderColor: '#1f2937',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3
  },
  inputBg: { backgroundColor: '#1f2937', borderColor: '#374151' },
  text: { color: '#f9fafb' },
  textMuted: { color: '#9ca3af' }
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  rtlText: { textAlign: 'right' },
  hostBanner: { padding: 12, borderRadius: 12, marginHorizontal: 16, marginTop: 12, marginBottom: 6, alignItems: 'center', justifyContent: 'space-between' },
  hostLabel: { fontSize: 12, fontWeight: '700' },
  hostInput: { width: 120, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', fontSize: 13, fontWeight: '700' },
  themeToggleBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  themeToggleText: { fontSize: 12, fontWeight: '700' },
  langBtn: { backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  langBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  authHeader: { alignItems: 'center', marginTop: 14, marginBottom: 18 },
  brandTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  brandSubtitle: { fontSize: 13, marginTop: 4 },
  formContainer: { paddingHorizontal: 16 },
  card: { padding: 22, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 4 },
  cardTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: '800', marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 14 },
  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { flex: 1, paddingRight: 45 },
  eyeBtn: { position: 'absolute', padding: 8, zIndex: 10 },
  rememberRow: { alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 18 },
  rememberText: { fontSize: 13, fontWeight: '600' },
  demoChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  demoChipText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  primaryButton: { backgroundColor: '#2563eb', height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  switchAuthBtn: { marginTop: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  switchAuthText: { fontSize: 13, fontWeight: '700' },
  errorBox: { backgroundColor: 'rgba(239,68,68,0.15)', padding: 12, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#ef4444' },
  errorText: { color: '#ef4444', fontSize: 13, fontWeight: '700' },
  appHeader: { paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.6)', alignItems: 'center' },
  headerUser: { fontSize: 16, fontWeight: '800' },
  headerRoleBadge: { color: '#2563eb', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  logoutBtn: { backgroundColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  logoutBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  toastBanner: { backgroundColor: '#2563eb', padding: 14, marginHorizontal: 16, marginTop: 12, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 3 },
  toastText: { color: '#ffffff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  driverStatusCard: { padding: 18, borderRadius: 18, marginBottom: 18, alignItems: 'center', justifyContent: 'space-between' },
  driverStatusTitle: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  driverStatusText: { color: '#ffffff', fontSize: 13, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  toggleStatusBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12 },
  toggleStatusBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 14, letterSpacing: -0.2 },
  emptyText: { textAlign: 'center', paddingVertical: 36, fontSize: 14 },
  orderCard: { padding: 18, borderRadius: 20, marginBottom: 16 },
  statCardAccentBlue: { borderLeftWidth: 4, borderLeftColor: '#2563eb' },
  statCardAccentAmber: { borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  statCardAccentEmerald: { borderLeftWidth: 4, borderLeftColor: '#10b981' },
  statCardAccentPurple: { borderLeftWidth: 4, borderLeftColor: '#7c3aed' },
  orderHeader: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  trackingNum: { fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  statusTag: { color: '#ffffff', fontSize: 11, fontWeight: '800', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  orderDetail: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  actionBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  walletRow: { marginBottom: 16 },
  walletCard: { padding: 16, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  walletLabel: { color: '#ffffff', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', opacity: 0.9 },
  walletValue: { color: '#ffffff', fontSize: 24, fontWeight: '900', marginVertical: 4 },
  walletSub: { color: '#ffffff', fontSize: 11, opacity: 0.85 },
  expenseBtn: { backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  expenseBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  statCardMini: { padding: 14, borderRadius: 14, justifyContent: 'center' },
  statCardMiniVal: { color: '#ffffff', fontSize: 22, fontWeight: '900' },
  statCardMiniSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', marginTop: 2 },
  pulseOnline: { width: 10, height: 10, borderRadius: 5 },
  clientName: { fontSize: 14, fontWeight: '800' },
  tabBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 65, borderTopWidth: 1, borderTopColor: '#e2e8f0', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 5 },
  tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%' },
  tabItemActive: { borderTopWidth: 2, borderTopColor: '#2563eb' },
  tabItemText: { fontSize: 10, fontWeight: '700', marginTop: 3 },
  tabBadge: { position: 'absolute', top: -4, right: -10, backgroundColor: '#ef4444', borderRadius: 10, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText: { color: '#ffffff', fontSize: 9, fontWeight: '900' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalCard: {
    width: '94%',
    maxWidth: 480,
    maxHeight: '90%',
    padding: 24,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
    lineHeight: 24,
    letterSpacing: -0.2
  },
  multilineInput: {
    height: 85,
    textAlignVertical: 'top',
    paddingTop: 12,
    lineHeight: 20
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#64748b',
    backgroundColor: 'rgba(100,116,139,0.06)'
  },
  cancelButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '800'
  },
  driverChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
  driverChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  driverChipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  driverChipTextActive: { color: '#ffffff' },
  presetChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
  presetChipActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  presetText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  presetTextActive: { color: '#ffffff' },
  miniActionBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  miniActionText: { color: '#ffffff', fontSize: 11, fontWeight: '800' }
});
