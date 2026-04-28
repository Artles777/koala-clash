cmake_minimum_required(VERSION 3.22)

project(KoalaProcessBypass LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(koala_process_bypass_common STATIC
  src/json.cpp
  src/platform.cpp
  src/wfp_policy.cpp
)

target_include_directories(koala_process_bypass_common PUBLIC include)
target_compile_definitions(koala_process_bypass_common PUBLIC UNICODE _UNICODE WIN32_LEAN_AND_MEAN)
target_link_libraries(koala_process_bypass_common PUBLIC fwpuclnt advapi32 shell32 ole32)

add_executable(koala-process-bypassctl src/controller_main.cpp)
target_link_libraries(koala-process-bypassctl PRIVATE koala_process_bypass_common)
set_target_properties(koala-process-bypassctl PROPERTIES OUTPUT_NAME "koala-process-bypassctl")

add_executable(KoalaProcessBypass src/service_main.cpp)
target_link_libraries(KoalaProcessBypass PRIVATE koala_process_bypass_common)
set_target_properties(KoalaProcessBypass PROPERTIES OUTPUT_NAME "KoalaProcessBypass")

install(TARGETS koala-process-bypassctl KoalaProcessBypass RUNTIME DESTINATION .)
