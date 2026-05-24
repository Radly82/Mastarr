[Setup]
AppName=MastARR
AppVersion=0.1
DefaultDirName={autopf}\MastARR
DefaultGroupName=MastARR
OutputDir=C:\Users\conra\CascadeProjects\mastarr installer
OutputBaseFilename=MastARR-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayIcon={app}\MA.png

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked
Name: "startmenu"; Description: "Create a Start Menu shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
Source: "index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "settings.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "about.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "MA.png"; DestDir: "{app}"; Flags: ignoreversion
Source: "ma1.jpg"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\MastARR"; Filename: "{win}\explorer.exe"; Parameters: """{app}\index.html"""; WorkingDir: "{app}"; IconFilename: "{app}\ma1.jpg"; Tasks: startmenu
Name: "{commondesktop}\MastARR"; Filename: "{win}\explorer.exe"; Parameters: """{app}\index.html"""; WorkingDir: "{app}"; IconFilename: "{app}\ma1.jpg"; Tasks: desktopicon
Name: "{group}\Uninstall MastARR"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\index.html"; Description: "Launch MastARR"; Flags: shellexec nowait postinstall skipifsilent
