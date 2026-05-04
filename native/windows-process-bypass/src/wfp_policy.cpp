#include "koala_process_bypass.h"

#include <initguid.h>

#include <algorithm>
#include <sstream>

// Koala-owned WFP objects. The callout GUIDs are intentionally separate from the provider and
// sublayer GUIDs because they must be registered by a privileged WFP callout driver. The
// user-mode controller never claims an active data plane unless these callouts already exist.
DEFINE_GUID(KOALA_PROCESS_BYPASS_PROVIDER, 0x88407cc1, 0xf9bc, 0x48d7, 0x8c, 0xef, 0xcf, 0x83, 0xba, 0x1f, 0x7c, 0x10);
DEFINE_GUID(KOALA_PROCESS_BYPASS_SUBLAYER, 0x4e9fa346, 0xf0b6, 0x4562, 0x87, 0x1f, 0x82, 0x6d, 0xb2, 0xf4, 0xad, 0xf6);
DEFINE_GUID(KOALA_PROCESS_BYPASS_CONNECT_REDIRECT_V4, 0x7be7ed97, 0x1a24, 0x4583, 0x89, 0x4f, 0x54, 0x92, 0x76, 0x03, 0xe7, 0x41);
DEFINE_GUID(KOALA_PROCESS_BYPASS_CONNECT_REDIRECT_V6, 0x3739dfd8, 0x9f81, 0x4a24, 0xb1, 0x62, 0x61, 0xe1, 0xfa, 0x0f, 0x70, 0x4d);

namespace koala {

namespace {

void AddDiagnostic(ControllerResult& result, const std::wstring& message) {
  result.diagnostics.push_back(message);
}

bool IsAlreadyExists(HRESULT hr) {
  return hr == FWP_E_ALREADY_EXISTS;
}

bool IsNotFound(HRESULT hr) {
  return hr == FWP_E_NOT_FOUND;
}

std::wstring FilterName(const std::wstring& processName, const std::wstring& sessionId, bool ipv6) {
  return L"Koala PROCESS-NAME bypass " + processName + (ipv6 ? L" IPv6 " : L" IPv4 ") + sessionId;
}

std::wstring FilterDescription(const std::wstring& sessionId, DWORD pid, const std::wstring& path) {
  std::wstringstream out;
  out << L"koala-session=" << sessionId << L"; pid=" << pid << L"; path=" << path;
  return out.str();
}

}  // namespace

ControllerResult WfpPolicyManager::Status(const ControllerOptions& options) {
  ControllerResult result;
  result.serviceAvailable = IsServiceInstalled(options.serviceName);
  result.elevated = IsRunningElevated();
  result.prerequisitesOk = result.serviceAvailable && result.elevated;
  result.activeSessionId = options.sessionId;

  if (!result.serviceAvailable) {
    result.reasonCode = L"windows_wfp_service_missing";
    result.message = L"KoalaProcessBypass service is not installed.";
    return result;
  }
  if (!result.elevated) {
    result.reasonCode = L"windows_admin_required";
    result.message = L"Controller is not running elevated.";
    return result;
  }
  if (!OpenEngine(result)) return result;
  const bool calloutsReady = RequiredCalloutsAvailable(result);
  CloseEngine();
  result.ok = calloutsReady;
  result.dataPlaneActive = calloutsReady;
  result.reasonCode = calloutsReady ? L"windows_data_plane_active" : L"windows_data_plane_inactive";
  result.message = calloutsReady
    ? L"Required WFP callouts are registered."
    : L"Required WFP callout driver is not registered.";
  return result;
}

ControllerResult WfpPolicyManager::Apply(const ControllerOptions& options) {
  ControllerResult result;
  result.serviceAvailable = IsServiceInstalled(options.serviceName);
  result.elevated = IsRunningElevated();
  result.activeSessionId = options.sessionId;
  result.prerequisitesOk = result.serviceAvailable && result.elevated;

  if (options.sessionId.empty()) {
    result.reasonCode = L"windows_apply_failed";
    result.message = L"--session is required.";
    return result;
  }
  if (options.processNames.empty()) {
    result.reasonCode = L"no_process_names";
    result.message = L"At least one --process-name is required.";
    return result;
  }
  if (!result.serviceAvailable) {
    result.reasonCode = L"windows_wfp_service_missing";
    result.message = L"KoalaProcessBypass service is not installed.";
    return result;
  }
  if (!result.elevated) {
    result.reasonCode = L"windows_admin_required";
    result.message = L"Controller must run elevated.";
    return result;
  }
  if (!OpenEngine(result)) return result;
  if (!RequiredCalloutsAvailable(result)) {
    CloseEngine();
    result.reasonCode = L"windows_data_plane_inactive";
    result.message = L"Required WFP callout driver is missing; refusing to claim active bypass.";
    return result;
  }
  if (!EnsureProviderAndSublayer(result)) {
    CloseEngine();
    return result;
  }

  Cleanup(options);
  if (!OpenEngine(result)) return result;
  if (!EnsureProviderAndSublayer(result)) {
    CloseEngine();
    return result;
  }

  const auto processes = FindProcessesByExactNames(options.processNames);
  if (processes.empty()) {
    CloseEngine();
    result.reasonCode = L"no_matching_processes";
    result.message = L"No currently-running process matched the requested process names.";
    return result;
  }

  std::vector<std::uint64_t> filterIds;
  for (const auto& process : processes) {
    AddCalloutFiltersForProcess(process, options.sessionId, filterIds, result);
  }

  CloseEngine();
  if (filterIds.empty()) {
    result.reasonCode = L"windows_apply_failed";
    result.message = L"No WFP filters were installed.";
    return result;
  }

  WriteSessionFilterIds(options.sessionId, filterIds);
  result.ok = true;
  result.policyInstalled = true;
  result.dataPlaneActive = true;
  result.filterCount = static_cast<std::uint32_t>(filterIds.size());
  result.reasonCode = L"windows_data_plane_active";
  result.message = L"Process-aware WFP callout filters are active.";
  result.appliedProcessNames = options.processNames;
  return result;
}

ControllerResult WfpPolicyManager::Cleanup(const ControllerOptions& options) {
  ControllerResult result;
  result.serviceAvailable = IsServiceInstalled(options.serviceName);
  result.elevated = IsRunningElevated();
  result.prerequisitesOk = result.serviceAvailable && result.elevated;
  result.activeSessionId = options.sessionId;

  if (options.sessionId.empty()) {
    result.reasonCode = L"windows_cleanup_failed";
    result.message = L"--session is required.";
    return result;
  }
  if (!result.elevated) {
    result.reasonCode = L"windows_admin_required";
    result.message = L"Controller must run elevated.";
    return result;
  }
  if (!OpenEngine(result)) return result;

  const auto filterIds = ReadSessionFilterIds(options.sessionId);
  std::uint32_t removed = 0;
  for (auto id : filterIds) {
    if (DeleteFilter(id, result)) ++removed;
  }
  CloseEngine();
  DeleteSessionFilterIds(options.sessionId);

  result.ok = true;
  result.dataPlaneActive = false;
  result.policyInstalled = false;
  result.filterCount = removed;
  result.reasonCode = L"windows_cleanup_complete";
  result.message = L"Session WFP filters were removed.";
  return result;
}

bool WfpPolicyManager::OpenEngine(ControllerResult& result) {
  if (engine_) return true;
  HANDLE engine = nullptr;
  HRESULT hr = FwpmEngineOpen0(nullptr, RPC_C_AUTHN_WINNT, nullptr, nullptr, &engine);
  if (FAILED(hr)) {
    result.reasonCode = L"windows_apply_failed";
    result.message = L"Could not open the WFP engine: " + HResultMessage(hr);
    AddDiagnostic(result, result.message);
    return false;
  }
  engine_ = engine;
  return true;
}

void WfpPolicyManager::CloseEngine() {
  if (!engine_) return;
  FwpmEngineClose0(engine_);
  engine_ = nullptr;
}

bool WfpPolicyManager::EnsureProviderAndSublayer(ControllerResult& result) {
  FWPM_PROVIDER0 provider{};
  provider.providerKey = KOALA_PROCESS_BYPASS_PROVIDER;
  provider.displayData.name = const_cast<wchar_t*>(L"Koala Process Bypass");
  provider.displayData.description = const_cast<wchar_t*>(L"Koala Clash process-aware bypass provider");
  HRESULT hr = FwpmProviderAdd0(engine_, &provider, nullptr);
  if (FAILED(hr) && !IsAlreadyExists(hr)) {
    result.reasonCode = L"windows_apply_failed";
    result.message = L"Could not add WFP provider: " + HResultMessage(hr);
    return false;
  }

  FWPM_SUBLAYER0 sublayer{};
  sublayer.subLayerKey = KOALA_PROCESS_BYPASS_SUBLAYER;
  sublayer.providerKey = const_cast<GUID*>(&KOALA_PROCESS_BYPASS_PROVIDER);
  sublayer.displayData.name = const_cast<wchar_t*>(L"Koala Process Bypass");
  sublayer.displayData.description = const_cast<wchar_t*>(L"Koala Clash process-aware bypass sublayer");
  sublayer.weight = 0x7fff;
  hr = FwpmSubLayerAdd0(engine_, &sublayer, nullptr);
  if (FAILED(hr) && !IsAlreadyExists(hr)) {
    result.reasonCode = L"windows_apply_failed";
    result.message = L"Could not add WFP sublayer: " + HResultMessage(hr);
    return false;
  }
  return true;
}

bool WfpPolicyManager::RequiredCalloutsAvailable(ControllerResult& result) {
  FWPM_CALLOUT0* callout = nullptr;
  HRESULT hr4 = FwpmCalloutGetByKey0(engine_, &KOALA_PROCESS_BYPASS_CONNECT_REDIRECT_V4, &callout);
  if (SUCCEEDED(hr4) && callout) FwpmFreeMemory0(reinterpret_cast<void**>(&callout));
  callout = nullptr;
  HRESULT hr6 = FwpmCalloutGetByKey0(engine_, &KOALA_PROCESS_BYPASS_CONNECT_REDIRECT_V6, &callout);
  if (SUCCEEDED(hr6) && callout) FwpmFreeMemory0(reinterpret_cast<void**>(&callout));

  if (SUCCEEDED(hr4) && SUCCEEDED(hr6)) return true;
  result.reasonCode = L"windows_data_plane_inactive";
  result.message = L"Required WFP connect-redirect callouts are not registered.";
  if (IsNotFound(hr4)) AddDiagnostic(result, L"IPv4 connect-redirect callout is missing.");
  if (IsNotFound(hr6)) AddDiagnostic(result, L"IPv6 connect-redirect callout is missing.");
  return false;
}

bool WfpPolicyManager::AddCalloutFiltersForProcess(
  const ProcessImage& process,
  const std::wstring& sessionId,
  std::vector<std::uint64_t>& ids,
  ControllerResult& result
) {
  FWP_BYTE_BLOB* appId = nullptr;
  HRESULT hr = FwpmGetAppIdFromFileName0(process.path.c_str(), &appId);
  if (FAILED(hr) || !appId) {
    AddDiagnostic(result, L"Could not build WFP app id for " + process.path + L": " + HResultMessage(hr));
    return false;
  }

  const struct LayerSpec {
    const GUID& layer;
    const GUID& callout;
    bool ipv6;
  } layers[] = {
    {FWPM_LAYER_ALE_CONNECT_REDIRECT_V4, KOALA_PROCESS_BYPASS_CONNECT_REDIRECT_V4, false},
    {FWPM_LAYER_ALE_CONNECT_REDIRECT_V6, KOALA_PROCESS_BYPASS_CONNECT_REDIRECT_V6, true}
  };

  for (const auto& layer : layers) {
    FWPM_FILTER_CONDITION0 condition{};
    condition.fieldKey = FWPM_CONDITION_ALE_APP_ID;
    condition.matchType = FWP_MATCH_EQUAL;
    condition.conditionValue.type = FWP_BYTE_BLOB_TYPE;
    condition.conditionValue.byteBlob = appId;

    const auto name = FilterName(process.name, sessionId, layer.ipv6);
    const auto description = FilterDescription(sessionId, process.pid, process.path);
    FWPM_FILTER0 filter{};
    filter.providerKey = const_cast<GUID*>(&KOALA_PROCESS_BYPASS_PROVIDER);
    filter.layerKey = layer.layer;
    filter.subLayerKey = KOALA_PROCESS_BYPASS_SUBLAYER;
    filter.displayData.name = const_cast<wchar_t*>(name.c_str());
    filter.displayData.description = const_cast<wchar_t*>(description.c_str());
    filter.action.type = FWP_ACTION_CALLOUT_TERMINATING;
    filter.action.calloutKey = layer.callout;
    filter.weight.type = FWP_EMPTY;
    filter.numFilterConditions = 1;
    filter.filterCondition = &condition;

    UINT64 filterId = 0;
    hr = FwpmFilterAdd0(engine_, &filter, nullptr, &filterId);
    if (FAILED(hr)) {
      AddDiagnostic(result, L"Could not add WFP filter for " + process.path + L": " + HResultMessage(hr));
      continue;
    }
    ids.push_back(filterId);
  }

  FwpmFreeMemory0(reinterpret_cast<void**>(&appId));
  return true;
}

bool WfpPolicyManager::DeleteFilter(std::uint64_t id, ControllerResult& result) {
  HRESULT hr = FwpmFilterDeleteById0(engine_, id);
  if (SUCCEEDED(hr) || IsNotFound(hr)) return true;
  AddDiagnostic(result, L"Could not delete WFP filter " + std::to_wstring(id) + L": " + HResultMessage(hr));
  return false;
}

}  // namespace koala
