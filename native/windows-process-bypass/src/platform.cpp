#include "koala_process_bypass.h"

#include <shlobj.h>
#include <tlhelp32.h>

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <sstream>

namespace koala {

namespace {

std::wstring ToLower(std::wstring value) {
  std::transform(value.begin(), value.end(), value.begin(), [](wchar_t c) {
    return static_cast<wchar_t>(towlower(c));
  });
  return value;
}

bool ProcessNameMatches(const std::wstring& actual, const std::wstring& expected) {
  const auto actualLower = ToLower(actual);
  const auto expectedLower = ToLower(expected);
  if (actualLower == expectedLower) return true;
  if (expectedLower.size() > 4 && expectedLower.substr(expectedLower.size() - 4) == L".exe") {
    return false;
  }
  return actualLower == expectedLower + L".exe";
}

std::wstring QueryProcessPath(DWORD pid) {
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!process) return L"";
  std::wstring buffer(32768, L'\0');
  DWORD size = static_cast<DWORD>(buffer.size());
  if (!QueryFullProcessImageNameW(process, 0, buffer.data(), &size)) {
    CloseHandle(process);
    return L"";
  }
  CloseHandle(process);
  buffer.resize(size);
  return buffer;
}

std::filesystem::path SessionFilePath(const std::wstring& sessionId) {
  return std::filesystem::path(ProgramDataSessionRoot()) / (sessionId + L".filters");
}

}  // namespace

std::wstring Utf8ToWide(const std::string& input) {
  if (input.empty()) return L"";
  int size = MultiByteToWideChar(CP_UTF8, 0, input.data(), static_cast<int>(input.size()), nullptr, 0);
  std::wstring output(size, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, input.data(), static_cast<int>(input.size()), output.data(), size);
  return output;
}

std::string WideToUtf8(const std::wstring& input) {
  if (input.empty()) return "";
  int size = WideCharToMultiByte(CP_UTF8, 0, input.data(), static_cast<int>(input.size()), nullptr, 0, nullptr, nullptr);
  std::string output(size, '\0');
  WideCharToMultiByte(CP_UTF8, 0, input.data(), static_cast<int>(input.size()), output.data(), size, nullptr, nullptr);
  return output;
}

std::wstring LastErrorMessage(DWORD error) {
  wchar_t* message = nullptr;
  FormatMessageW(
    FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
    nullptr,
    error,
    MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
    reinterpret_cast<LPWSTR>(&message),
    0,
    nullptr
  );
  std::wstring result = message ? message : L"unknown error";
  if (message) LocalFree(message);
  return result;
}

std::wstring HResultMessage(HRESULT hr) {
  return LastErrorMessage(static_cast<DWORD>(hr));
}

bool IsRunningElevated() {
  BOOL isMember = FALSE;
  PSID adminGroup = nullptr;
  SID_IDENTIFIER_AUTHORITY ntAuthority = SECURITY_NT_AUTHORITY;
  if (!AllocateAndInitializeSid(
        &ntAuthority,
        2,
        SECURITY_BUILTIN_DOMAIN_RID,
        DOMAIN_ALIAS_RID_ADMINS,
        0,
        0,
        0,
        0,
        0,
        0,
        &adminGroup
      )) {
    return false;
  }
  BOOL ok = CheckTokenMembership(nullptr, adminGroup, &isMember);
  FreeSid(adminGroup);
  return ok && isMember;
}

bool IsServiceInstalled(const std::wstring& serviceName) {
  SC_HANDLE scm = OpenSCManagerW(nullptr, nullptr, SC_MANAGER_CONNECT);
  if (!scm) return false;
  SC_HANDLE service = OpenServiceW(scm, serviceName.c_str(), SERVICE_QUERY_STATUS);
  if (!service) {
    CloseServiceHandle(scm);
    return false;
  }
  CloseServiceHandle(service);
  CloseServiceHandle(scm);
  return true;
}

std::vector<ProcessImage> FindProcessesByExactNames(const std::vector<std::wstring>& names) {
  std::vector<ProcessImage> result;
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) return result;

  PROCESSENTRY32W entry{};
  entry.dwSize = sizeof(entry);
  if (!Process32FirstW(snapshot, &entry)) {
    CloseHandle(snapshot);
    return result;
  }

  do {
    for (const auto& name : names) {
      if (!ProcessNameMatches(entry.szExeFile, name)) continue;
      ProcessImage image;
      image.pid = entry.th32ProcessID;
      image.name = entry.szExeFile;
      image.path = QueryProcessPath(entry.th32ProcessID);
      if (!image.path.empty()) result.push_back(image);
    }
  } while (Process32NextW(snapshot, &entry));

  CloseHandle(snapshot);
  return result;
}

std::wstring ProgramDataSessionRoot() {
  PWSTR programData = nullptr;
  HRESULT hr = SHGetKnownFolderPath(FOLDERID_ProgramData, KF_FLAG_DEFAULT, nullptr, &programData);
  std::filesystem::path root = SUCCEEDED(hr) && programData
    ? std::filesystem::path(programData)
    : std::filesystem::temp_directory_path();
  if (programData) CoTaskMemFree(programData);
  return (root / L"KoalaClash" / L"ProcessBypass" / L"sessions").wstring();
}

bool WriteSessionFilterIds(const std::wstring& sessionId, const std::vector<std::uint64_t>& ids) {
  std::filesystem::create_directories(ProgramDataSessionRoot());
  std::ofstream out(SessionFilePath(sessionId), std::ios::trunc);
  if (!out) return false;
  for (auto id : ids) out << id << "\n";
  return true;
}

std::vector<std::uint64_t> ReadSessionFilterIds(const std::wstring& sessionId) {
  std::vector<std::uint64_t> ids;
  std::ifstream in(SessionFilePath(sessionId));
  std::uint64_t id = 0;
  while (in >> id) ids.push_back(id);
  return ids;
}

void DeleteSessionFilterIds(const std::wstring& sessionId) {
  std::error_code ignored;
  std::filesystem::remove(SessionFilePath(sessionId), ignored);
}

}  // namespace koala
