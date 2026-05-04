#include "koala_process_bypass.h"

#include <iostream>

namespace koala {

namespace {

SERVICE_STATUS_HANDLE g_statusHandle = nullptr;
SERVICE_STATUS g_status{};
HANDLE g_stopEvent = nullptr;

void ReportServiceStatus(DWORD state, DWORD win32ExitCode, DWORD waitHint) {
  static DWORD checkpoint = 1;
  g_status.dwServiceType = SERVICE_WIN32_OWN_PROCESS;
  g_status.dwCurrentState = state;
  g_status.dwWin32ExitCode = win32ExitCode;
  g_status.dwWaitHint = waitHint;
  g_status.dwControlsAccepted = state == SERVICE_START_PENDING ? 0 : SERVICE_ACCEPT_STOP;
  g_status.dwCheckPoint =
    state == SERVICE_RUNNING || state == SERVICE_STOPPED ? 0 : checkpoint++;
  SetServiceStatus(g_statusHandle, &g_status);
}

void WINAPI ServiceCtrlHandler(DWORD control) {
  if (control != SERVICE_CONTROL_STOP) return;
  ReportServiceStatus(SERVICE_STOP_PENDING, NO_ERROR, 0);
  if (g_stopEvent) SetEvent(g_stopEvent);
}

void WINAPI ServiceMain(DWORD, LPWSTR*) {
  g_statusHandle = RegisterServiceCtrlHandlerW(kServiceName, ServiceCtrlHandler);
  if (!g_statusHandle) return;

  ReportServiceStatus(SERVICE_START_PENDING, NO_ERROR, 3000);
  g_stopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (!g_stopEvent) {
    ReportServiceStatus(SERVICE_STOPPED, GetLastError(), 0);
    return;
  }

  ReportServiceStatus(SERVICE_RUNNING, NO_ERROR, 0);
  WaitForSingleObject(g_stopEvent, INFINITE);
  CloseHandle(g_stopEvent);
  g_stopEvent = nullptr;
  ReportServiceStatus(SERVICE_STOPPED, NO_ERROR, 0);
}

bool InstallService(const wchar_t* binaryPath) {
  SC_HANDLE scm = OpenSCManagerW(nullptr, nullptr, SC_MANAGER_CREATE_SERVICE);
  if (!scm) return false;
  SC_HANDLE service = CreateServiceW(
    scm,
    kServiceName,
    L"Koala Process Bypass",
    SERVICE_ALL_ACCESS,
    SERVICE_WIN32_OWN_PROCESS,
    SERVICE_DEMAND_START,
    SERVICE_ERROR_NORMAL,
    binaryPath,
    nullptr,
    nullptr,
    nullptr,
    nullptr,
    nullptr
  );
  if (!service && GetLastError() == ERROR_SERVICE_EXISTS) {
    CloseServiceHandle(scm);
    return true;
  }
  if (!service) {
    CloseServiceHandle(scm);
    return false;
  }
  CloseServiceHandle(service);
  CloseServiceHandle(scm);
  return true;
}

bool UninstallService() {
  SC_HANDLE scm = OpenSCManagerW(nullptr, nullptr, SC_MANAGER_CONNECT);
  if (!scm) return false;
  SC_HANDLE service = OpenServiceW(scm, kServiceName, DELETE | SERVICE_STOP);
  if (!service) {
    CloseServiceHandle(scm);
    return false;
  }
  SERVICE_STATUS status{};
  ControlService(service, SERVICE_CONTROL_STOP, &status);
  const BOOL deleted = DeleteService(service);
  CloseServiceHandle(service);
  CloseServiceHandle(scm);
  return deleted;
}

}  // namespace

int RunServiceHost(int argc, wchar_t** argv) {
  if (argc > 1 && _wcsicmp(argv[1], L"install") == 0) {
    wchar_t path[MAX_PATH]{};
    GetModuleFileNameW(nullptr, path, MAX_PATH);
    if (!InstallService(path)) {
      std::wcerr << L"install failed: " << LastErrorMessage(GetLastError()) << std::endl;
      return 1;
    }
    std::wcout << L"installed " << kServiceName << std::endl;
    return 0;
  }
  if (argc > 1 && _wcsicmp(argv[1], L"uninstall") == 0) {
    if (!UninstallService()) {
      std::wcerr << L"uninstall failed: " << LastErrorMessage(GetLastError()) << std::endl;
      return 1;
    }
    std::wcout << L"uninstalled " << kServiceName << std::endl;
    return 0;
  }

  SERVICE_TABLE_ENTRYW dispatchTable[] = {
    {const_cast<LPWSTR>(kServiceName), ServiceMain},
    {nullptr, nullptr}
  };
  if (!StartServiceCtrlDispatcherW(dispatchTable)) {
    std::wcerr << L"service dispatcher failed: " << LastErrorMessage(GetLastError()) << std::endl;
    return 1;
  }
  return 0;
}

}  // namespace koala

int wmain(int argc, wchar_t** argv) {
  return koala::RunServiceHost(argc, argv);
}
