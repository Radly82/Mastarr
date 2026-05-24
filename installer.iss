[Setup]
AppName=MastARR
AppVersion=0.1.0
DefaultDirName={autopf}\MastARR
DefaultGroupName=MastARR
OutputDir=dist
OutputBaseFilename=MastARR-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayName=MastARR
UninstallDisplayIcon={app}\ma1.ico

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: checkedonce

[Files]
Source: "dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "ma1.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\MastARR"; Filename: "{app}\MastARR.exe"; WorkingDir: "{app}"; IconFilename: "{app}\ma1.ico"
Name: "{commondesktop}\MastARR"; Filename: "{app}\MastARR.exe"; WorkingDir: "{app}"; IconFilename: "{app}\ma1.ico"; Tasks: desktopicon
Name: "{group}\Uninstall MastARR"; Filename: "{uninstallexe}"; IconFilename: "{app}\ma1.ico"

[Run]
Filename: "{app}\MastARR.exe"; Description: "Launch MastARR"; Flags: nowait postinstall skipifsilent

[Code]
const
  TH32CS_SNAPPROCESS = $00000002;
  INVALID_HANDLE_VALUE = -1;

type
  TPROCESSENTRY32 = record
    dwSize: Longword;
    cntUsage: Longword;
    th32ProcessID: Longword;
    th32DefaultHeapID: Longword;
    th32ModuleID: Longword;
    cntThreads: Longword;
    th32ParentProcessID: Longword;
    pcPriClassBase: Longint;
    dwFlags: Longword;
    szExeFile: String;
  end;

var
  RemoveUserData: Boolean;

function CreateToolhelp32Snapshot(dwFlags, th32ProcessID: Longword): Longword;
  external 'CreateToolhelp32Snapshot@kernel32.dll stdcall';

function Process32First(hSnapshot: Longword; var lppe: TPROCESSENTRY32): Boolean;
  external 'Process32FirstW@kernel32.dll stdcall';

function Process32Next(hSnapshot: Longword; var lppe: TPROCESSENTRY32): Boolean;
  external 'Process32NextW@kernel32.dll stdcall';

function CloseHandle(hObject: Longword): Boolean;
  external 'CloseHandle@kernel32.dll stdcall';

function IsMastArrRunning(): Boolean;
var
  Snapshot: Longword;
  ProcessEntry: TPROCESSENTRY32;
begin
  Result := False;
  Snapshot := CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);

  if Snapshot = INVALID_HANDLE_VALUE then
  begin
    exit;
  end;

  ProcessEntry.dwSize := SizeOf(ProcessEntry);

  if Process32First(Snapshot, ProcessEntry) then
  begin
    repeat
      if CompareText(ProcessEntry.szExeFile, 'MastARR.exe') = 0 then
      begin
        Result := True;
        break;
      end;
    until not Process32Next(Snapshot, ProcessEntry);
  end;

  CloseHandle(Snapshot);
end;

function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
begin
  if IsMastArrRunning() then
  begin
    if MsgBox(
      'MastARR is still running.' + #13#10 + #13#10 +
      'The uninstaller needs to close MastARR before continuing.' + #13#10 + #13#10 +
      'Do you want to close MastARR now?',
      mbConfirmation,
      MB_YESNO
    ) <> IDYES then
    begin
      Result := False;
      exit;
    end;

    Exec(ExpandConstant('{cmd}'), '/C taskkill /IM MastARR.exe /F /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(2000);

    if IsMastArrRunning() then
    begin
      MsgBox(
        'MastARR could not be closed automatically.' + #13#10 + #13#10 +
        'Please close MastARR manually and then run the uninstaller again.',
        mbError,
        MB_OK
      );

      Result := False;
      exit;
    end;
  end;

  RemoveUserData := MsgBox(
    'Do you also want to remove saved MastARR settings and app data?' + #13#10 + #13#10 +
    'Choose Yes to remove saved Sonarr, Radarr, SABnzbd, and app settings.' + #13#10 +
    'Choose No to keep settings for a future reinstall.',
    mbConfirmation,
    MB_YESNO
  ) = IDYES;

  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and RemoveUserData then
  begin
    DelTree(ExpandConstant('{userappdata}\MastARR'), True, True, True);
    DelTree(ExpandConstant('{localappdata}\MastARR'), True, True, True);
    DelTree(ExpandConstant('{userappdata}\mastarr'), True, True, True);
    DelTree(ExpandConstant('{localappdata}\mastarr'), True, True, True);
  end;
end;
