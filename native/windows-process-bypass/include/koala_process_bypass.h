#pragma once

#include <windows.h>
#include <fwpmu.h>

#include <cstdint>
#include <string>
#include <vector>

namespace koala {

constexpr wchar_t kServiceName[] = L"KoalaProcessBypass";
constexpr wchar_t kControllerName[] = L"koala-process-bypassctl.exe";

struct ControllerOptions {
  std::wstring command;
  std::wstring sessionId;
  std::wstring serviceName = kServiceName;
  std::vector<std::wstring> processNames;
  bool json = false;
};

struct ProcessImage {
  DWORD pid = 0;
  std::wstring name;
  std::wstring path;
};

struct ControllerResult {
  bool ok = false;
  bool serviceAvailable = false;
  bool elevated = false;
  bool prerequisitesOk = false;
  bool dataPlaneActive = false;
  bool policyInstalled = false;
  std::wstring activeSessionId;
  std::wstring reasonCode;
  std::wstring message;
  std::vector<std::wstring> diagnostics;
  std::vector<std::wstring> appliedProcessNames;
  std::uint32_t filterCount = 0;
};

std::string ToJson(const ControllerResult& result);
void PrintResult(const ControllerResult& result, bool json);

std::wstring Utf8ToWide(const std::string& input);
std::string WideToUtf8(const std::wstring& input);
std::wstring LastErrorMessage(DWORD error);
std::wstring HResultMessage(HRESULT hr);

bool IsRunningElevated();
bool IsServiceInstalled(const std::wstring& serviceName);
std::vector<ProcessImage> FindProcessesByExactNames(const std::vector<std::wstring>& names);
std::wstring ProgramDataSessionRoot();
bool WriteSessionFilterIds(const std::wstring& sessionId, const std::vector<std::uint64_t>& ids);
std::vector<std::uint64_t> ReadSessionFilterIds(const std::wstring& sessionId);
void DeleteSessionFilterIds(const std::wstring& sessionId);

class WfpPolicyManager {
 public:
  ControllerResult Status(const ControllerOptions& options);
  ControllerResult Apply(const ControllerOptions& options);
  ControllerResult Cleanup(const ControllerOptions& options);

 private:
  bool OpenEngine(ControllerResult& result);
  void CloseEngine();
  bool EnsureProviderAndSublayer(ControllerResult& result);
  bool RequiredCalloutsAvailable(ControllerResult& result);
  bool AddCalloutFiltersForProcess(
    const ProcessImage& process,
    const std::wstring& sessionId,
    std::vector<std::uint64_t>& ids,
    ControllerResult& result
  );
  bool DeleteFilter(std::uint64_t id, ControllerResult& result);

  HANDLE engine_ = nullptr;
};

ControllerOptions ParseControllerArgs(int argc, wchar_t** argv);
int RunController(int argc, wchar_t** argv);
int RunServiceHost(int argc, wchar_t** argv);

}  // namespace koala
