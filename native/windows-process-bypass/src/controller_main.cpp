#include "koala_process_bypass.h"

#include <shellapi.h>

#include <iostream>

namespace koala {

namespace {

bool IsFlag(const std::wstring& value, const wchar_t* flag) {
  return _wcsicmp(value.c_str(), flag) == 0;
}

ControllerResult UsageResult() {
  ControllerResult result;
  result.reasonCode = L"invalid_arguments";
  result.message =
    L"Usage: koala-process-bypassctl.exe <status|apply|cleanup> --session <id> "
    L"[--service KoalaProcessBypass] [--process-name name] [--json]";
  return result;
}

}  // namespace

ControllerOptions ParseControllerArgs(int argc, wchar_t** argv) {
  ControllerOptions options;
  if (argc > 1) options.command = argv[1];
  for (int index = 2; index < argc; ++index) {
    std::wstring arg = argv[index];
    if (IsFlag(arg, L"--json")) {
      options.json = true;
    } else if (IsFlag(arg, L"--session") && index + 1 < argc) {
      options.sessionId = argv[++index];
    } else if (IsFlag(arg, L"--service") && index + 1 < argc) {
      options.serviceName = argv[++index];
    } else if (IsFlag(arg, L"--process-name") && index + 1 < argc) {
      options.processNames.push_back(argv[++index]);
    }
  }
  return options;
}

int RunController(int argc, wchar_t** argv) {
  ControllerOptions options = ParseControllerArgs(argc, argv);
  WfpPolicyManager manager;
  ControllerResult result;

  if (options.command == L"status") {
    result = manager.Status(options);
  } else if (options.command == L"apply") {
    result = manager.Apply(options);
  } else if (options.command == L"cleanup") {
    result = manager.Cleanup(options);
  } else {
    result = UsageResult();
  }

  PrintResult(result, options.json);
  return result.ok ? 0 : 1;
}

}  // namespace koala

int wmain(int argc, wchar_t** argv) {
  return koala::RunController(argc, argv);
}
