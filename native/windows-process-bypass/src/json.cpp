#include "koala_process_bypass.h"

#include <iostream>
#include <sstream>

namespace koala {

namespace {

std::string EscapeJson(const std::wstring& value) {
  std::string utf8 = WideToUtf8(value);
  std::ostringstream out;
  for (char c : utf8) {
    switch (c) {
      case '"':
        out << "\\\"";
        break;
      case '\\':
        out << "\\\\";
        break;
      case '\b':
        out << "\\b";
        break;
      case '\f':
        out << "\\f";
        break;
      case '\n':
        out << "\\n";
        break;
      case '\r':
        out << "\\r";
        break;
      case '\t':
        out << "\\t";
        break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          out << "\\u00";
          const char* hex = "0123456789abcdef";
          out << hex[(c >> 4) & 0x0f] << hex[c & 0x0f];
        } else {
          out << c;
        }
    }
  }
  return out.str();
}

void AppendStringArray(std::ostringstream& out, const char* name, const std::vector<std::wstring>& values) {
  out << ",\"" << name << "\":[";
  for (std::size_t index = 0; index < values.size(); ++index) {
    if (index > 0) out << ',';
    out << '"' << EscapeJson(values[index]) << '"';
  }
  out << ']';
}

}  // namespace

std::string ToJson(const ControllerResult& result) {
  std::ostringstream out;
  out << '{';
  out << "\"ok\":" << (result.ok ? "true" : "false");
  out << ",\"serviceAvailable\":" << (result.serviceAvailable ? "true" : "false");
  out << ",\"elevated\":" << (result.elevated ? "true" : "false");
  out << ",\"prerequisitesOk\":" << (result.prerequisitesOk ? "true" : "false");
  out << ",\"dataPlaneActive\":" << (result.dataPlaneActive ? "true" : "false");
  out << ",\"policyInstalled\":" << (result.policyInstalled ? "true" : "false");
  out << ",\"filterCount\":" << result.filterCount;
  out << ",\"activeSessionId\":\"" << EscapeJson(result.activeSessionId) << '"';
  out << ",\"reasonCode\":\"" << EscapeJson(result.reasonCode) << '"';
  out << ",\"message\":\"" << EscapeJson(result.message) << '"';
  AppendStringArray(out, "diagnostics", result.diagnostics);
  AppendStringArray(out, "appliedProcessNames", result.appliedProcessNames);
  out << '}';
  return out.str();
}

void PrintResult(const ControllerResult& result, bool json) {
  if (json) {
    std::cout << ToJson(result) << std::endl;
    return;
  }

  std::wcout << L"ok: " << (result.ok ? L"true" : L"false") << std::endl;
  std::wcout << L"serviceAvailable: " << (result.serviceAvailable ? L"true" : L"false") << std::endl;
  std::wcout << L"elevated: " << (result.elevated ? L"true" : L"false") << std::endl;
  std::wcout << L"dataPlaneActive: " << (result.dataPlaneActive ? L"true" : L"false") << std::endl;
  std::wcout << L"reasonCode: " << result.reasonCode << std::endl;
  std::wcout << L"message: " << result.message << std::endl;
}

}  // namespace koala
