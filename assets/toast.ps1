param(
    [string]$Title = 'Task complete',
    [string]$Sub = '',
    [string]$Cost = '',
    [int]$Ms = 6000
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -Namespace Win32 -Name Dpi -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'
[void][Win32.Dpi]::SetProcessDPIAware()
[System.Windows.Forms.Application]::EnableVisualStyles()

$width = 380
$height = 112
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$targetX = $area.Right - $width - 16
$targetY = $area.Bottom - $height - 16

$bg = [System.Drawing.Color]::FromArgb(30, 31, 34)
$fg = [System.Drawing.Color]::FromArgb(232, 234, 237)
$muted = [System.Drawing.Color]::FromArgb(154, 160, 166)
$accent = [System.Drawing.Color]::FromArgb(77, 208, 143)

$script:form = New-Object System.Windows.Forms.Form
$script:form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$script:form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$script:form.ShowInTaskbar = $false
$script:form.TopMost = $true
$script:form.BackColor = $bg
$script:form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
$script:form.Size = New-Object System.Drawing.Size($width, $height)
$script:form.Location = New-Object System.Drawing.Point($area.Right, $targetY)
$script:form.Opacity = 0

$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 14
$path.AddArc(0, 0, $r, $r, 180, 90)
$path.AddArc($width - $r, 0, $r, $r, 270, 90)
$path.AddArc($width - $r, $height - $r, $r, $r, 0, 90)
$path.AddArc(0, $height - $r, $r, $r, 90, 90)
$path.CloseFigure()
$script:form.Region = New-Object System.Drawing.Region($path)

$bar = New-Object System.Windows.Forms.Panel
$bar.BackColor = $accent
$bar.Size = New-Object System.Drawing.Size(4, $height)
$bar.Location = New-Object System.Drawing.Point(0, 0)
$script:form.Controls.Add($bar)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = $Title
$titleLabel.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
$titleLabel.ForeColor = $fg
$titleLabel.BackColor = [System.Drawing.Color]::Transparent
$titleLabel.AutoSize = $false
$titleLabel.Location = New-Object System.Drawing.Point(20, 14)
$titleLabel.Size = New-Object System.Drawing.Size(340, 26)
$script:form.Controls.Add($titleLabel)

$subLabel = New-Object System.Windows.Forms.Label
$subLabel.Text = $Sub
$subLabel.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$subLabel.ForeColor = $muted
$subLabel.BackColor = [System.Drawing.Color]::Transparent
$subLabel.AutoSize = $false
$subLabel.Location = New-Object System.Drawing.Point(20, 42)
$subLabel.Size = New-Object System.Drawing.Size(340, 22)
$script:form.Controls.Add($subLabel)

$costLabel = New-Object System.Windows.Forms.Label
$costLabel.Text = $Cost
$costLabel.Font = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
$costLabel.ForeColor = $accent
$costLabel.BackColor = [System.Drawing.Color]::Transparent
$costLabel.AutoSize = $false
$costLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$costLabel.Location = New-Object System.Drawing.Point(20, 66)
$costLabel.Size = New-Object System.Drawing.Size(340, 32)
$script:form.Controls.Add($costLabel)

$script:start = [System.Diagnostics.Stopwatch]::StartNew()
$script:closing = $false
$script:holdMs = $Ms

$script:timer = New-Object System.Windows.Forms.Timer
$script:timer.Interval = 15
$script:timer.Add_Tick({
        $t = $script:start.ElapsedMilliseconds
        if ($t -lt 220) {
            $p = $t / 220.0
            $ease = 1 - [Math]::Pow(1 - $p, 3)
            $script:form.Left = [int]($script:area.Right + ($script:targetX - $script:area.Right) * $ease)
            $script:form.Opacity = $ease
        }
        elseif ($t -lt ($script:holdMs + 220)) {
            $script:form.Left = $script:targetX
            $script:form.Opacity = 1
        }
        elseif ($t -lt ($script:holdMs + 520)) {
            $script:form.Opacity = [Math]::Max(0, 1 - ($t - $script:holdMs - 220) / 300.0)
        }
        else {
            $script:closing = $true
            $script:timer.Stop()
            $script:form.Close()
        }
    })

$script:close = {
    if ($script:closing) { return }
    $script:closing = $true
    $script:timer.Stop()
    $script:form.Close()
}
$script:form.Add_Click($script:close)
$titleLabel.Add_Click($script:close)
$subLabel.Add_Click($script:close)
$costLabel.Add_Click($script:close)

$script:form.Add_Shown({
        $wav = Join-Path $env:WINDIR 'Media\Windows Notify System Generic.wav'
        if (Test-Path $wav) {
            $script:player = New-Object System.Media.SoundPlayer $wav
            $script:player.Play()
        }
        else {
            [System.Media.SystemSounds]::Asterisk.Play()
        }
        $script:timer.Start()
    })
[void]$script:form.ShowDialog()
